import { SQLiteManager } from "../database/sqlite-manager";
import { getProjectIdFromCwd, getProjectNameFromCwd } from "../utils/context-helper";
import { AppError, errorResponse } from "../utils/errors";
import { logger } from "../logger";
import { LRUCache } from "../utils/lru-cache";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function registerProjectTools(db: SQLiteManager) {
  // Cache for frequently accessed projects (max 100 entries)
  const projectCache = new LRUCache<string, Project>(100);

  return {
    set_project: (args: { id?: string; name?: string; description?: string; cwd?: string }) => {
      try {
        const id = args.id ?? getProjectIdFromCwd(args.cwd);
        const name = args.name ?? getProjectNameFromCwd(args.cwd);
        const description = args.description ?? null;

        const existing = db.get<Project>("SELECT * FROM projects WHERE id = ?", [id]);

        if (existing) {
          db.run("UPDATE projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [name, description, id]);
          const updated = db.get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
          if (!updated) throw new AppError("INTERNAL_ERROR", "Failed to retrieve updated project");
          // Invalidate cache for this project
          projectCache.delete(id);
          logger.info({ project_id: id }, "project updated");
          return { success: true, action: "updated", project: updated };
        } else {
          db.run("INSERT INTO projects (id, name, description) VALUES (?, ?, ?)", [id, name, description]);
          const created = db.get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
          if (!created) throw new AppError("INTERNAL_ERROR", "Failed to retrieve created project");
          // Cache the new project
          projectCache.set(id, created);
          logger.info({ project_id: id }, "project created");
          return { success: true, action: "created", project: created };
        }
      } catch (err) {
        logger.error({ err }, "set_project failed");
        return errorResponse(err);
      }
    },

    get_project: (args: { id: string }) => {
      try {
        // Try cache first
        const cached = projectCache.get(args.id);
        if (cached) {
          logger.debug({ project_id: args.id }, "project retrieved from cache");
          return { success: true, project: cached };
        }

        // Cache miss - query database
        const project = db.get<Project>("SELECT * FROM projects WHERE id = ?", [args.id]);
        if (!project) throw new AppError("NOT_FOUND", `project '${args.id}' not found`);
        
        // Cache the result
        projectCache.set(args.id, project);
        return { success: true, project };
      } catch (err) {
        logger.error({ err }, "get_project failed");
        return errorResponse(err);
      }
    },

    list_projects: () => {
      try {
        const projects = db.all<Project>("SELECT * FROM projects ORDER BY updated_at DESC");
        return { success: true, projects, total: projects.length };
      } catch (err) {
        logger.error({ err }, "list_projects failed");
        return errorResponse(err);
      }
    },

    delete_project: (args: { id: string }) => {
      try {
        const existing = db.get<Project>("SELECT id FROM projects WHERE id = ?", [args.id]);
        if (!existing) throw new AppError("NOT_FOUND", `project '${args.id}' not found`);

        db.run("DELETE FROM projects WHERE id = ?", [args.id]);
        // Invalidate cache for this project
        projectCache.delete(args.id);
        logger.info({ project_id: args.id }, "project deleted");
        return { success: true, deleted_id: args.id };
      } catch (err) {
        logger.error({ err }, "delete_project failed");
        return errorResponse(err);
      }
    },
  };
}
