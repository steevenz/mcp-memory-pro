import { SQLiteManager } from "../database/sqlite-manager";
import { AppError, errorResponse } from "../utils/errors";
import { logger } from "../logger";

interface SearchResult {
  node_id: string;
  project_id: string;
  project_name: string;
  node_name: string;
  node_type: string;
  content: string | null;
  tags: string | null;
  rank: number;
}

/**
 * Wraps each token in double-quotes so FTS5 treats them as phrase literals.
 */
function sanitizeFtsQuery(raw: string): string | null {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"`);
  return tokens.length > 0 ? tokens.join(" ") : null;
}

export interface Filter {
  key: string;
  op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN";
  value: string | number | boolean | string[] | number[];
}

function buildComplexFilters(filters: Filter[]): { sql: string; params: (string | number | boolean)[] } {
  let sql = "";
  const params: (string | number | boolean)[] = [];
  const allowedOps = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"];

  for (const f of filters) {
    const op = f.op.toUpperCase();
    if (!allowedOps.includes(op)) continue;
    // Only allow alphanumeric keys for safety
    if (!/^[\w.-]+$/.test(f.key)) continue;

    if (op === "IN") {
      if (!Array.isArray(f.value) || f.value.length === 0) continue;
      const ph = f.value.map(() => "?").join(", ");
      sql += ` AND json_extract(n.metadata, '$.${f.key}') IN (${ph})`;
      params.push(...f.value);
    } else {
      sql += ` AND json_extract(n.metadata, '$.${f.key}') ${f.op} ?`;
      params.push(f.value);
    }
  }
  return { sql, params };
}

export function registerSearchTools(db: SQLiteManager) {
  return {
    /**
     * search_nodes: FTS5 search within a single project.
     * MATCH is isolated in a subquery so additional AND filters on joined
     * tables don't interfere with FTS5 query parsing.
     */
      search_nodes: (args: {
        project_id: string;
        query: string;
        type?: string;
        filters?: Filter[];
        limit?: number;
      }) => {
        try {
          const ftsQuery = sanitizeFtsQuery(args.query);
          if (!ftsQuery) throw new AppError("INVALID_INPUT", "query must not be empty");
          const limit = Math.min(args.limit ?? 20, 100);
  
          let sql = `
            SELECT
              n.id        AS node_id,
              n.project_id,
              p.name      AS project_name,
              n.name      AS node_name,
              n.type      AS node_type,
              n.content,
              n.tags,
              fts_sub.rank
            FROM (
              SELECT node_id, project_id, -rank AS rank
              FROM nodes_fts
              WHERE nodes_fts MATCH ?
                AND project_id = ?
            ) fts_sub
            JOIN nodes n    ON n.id = fts_sub.node_id AND n.deleted_at IS NULL
            JOIN projects p ON p.id = n.project_id
            WHERE 1=1
          `;
          const params: unknown[] = [ftsQuery, args.project_id];
  
          if (args.type) {
            sql += " AND n.type = ?";
            params.push(args.type);
          }
  
          if (args.filters && args.filters.length > 0) {
            const { sql: fSql, params: fParams } = buildComplexFilters(args.filters);
            sql += fSql;
            params.push(...fParams);
          }
  
          sql += " ORDER BY fts_sub.rank DESC LIMIT ?";
          params.push(limit);
  
          const results = db.all<SearchResult>(sql, params);
          return { success: true, results, total: results.length };
      } catch (err) {
        logger.error({ err }, "search_nodes failed");
        return errorResponse(err);
      }
    },

    /**
     * search_cross_project: FTS5 search across all (or selected) projects.
     */
    search_cross_project: (args: {
      query: string;
      type?: string;
      project_ids?: string[];
      filters?: Filter[];
      limit?: number;
    }) => {
      try {
        const ftsQuery = sanitizeFtsQuery(args.query);
        if (!ftsQuery) throw new AppError("INVALID_INPUT", "query must not be empty");
        const limit = Math.min(args.limit ?? 20, 100);

        let ftsWhere = "WHERE nodes_fts MATCH ?";
        const ftsParams: unknown[] = [ftsQuery];

        if (args.project_ids && args.project_ids.length > 0) {
          const ph = args.project_ids.map(() => "?").join(", ");
          ftsWhere += ` AND project_id IN (${ph})`;
          ftsParams.push(...args.project_ids);
        }

        let sql = `
          SELECT
            n.id        AS node_id,
            n.project_id,
            p.name      AS project_name,
            n.name      AS node_name,
            n.type      AS node_type,
            n.content,
            n.tags,
            fts_sub.rank
          FROM (
            SELECT node_id, project_id, -rank AS rank
            FROM nodes_fts
            ${ftsWhere}
          ) fts_sub
          JOIN nodes n    ON n.id = fts_sub.node_id AND n.deleted_at IS NULL
          JOIN projects p ON p.id = n.project_id
          WHERE 1=1
        `;
        const params: unknown[] = [...ftsParams];

        if (args.type) {
          sql += " AND n.type = ?";
          params.push(args.type);
        }

        if (args.filters && args.filters.length > 0) {
          const { sql: fSql, params: fParams } = buildComplexFilters(args.filters);
          sql += fSql;
          params.push(...fParams);
        }

        sql += " ORDER BY fts_sub.rank DESC LIMIT ?";
        params.push(limit);

        const results = db.all<SearchResult>(sql, params);
        return { success: true, results, total: results.length };
      } catch (err) {
        logger.error({ err }, "search_cross_project failed");
        return errorResponse(err);
      }
    },
  };
}
