import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";
import { logger } from "../logger";

export interface RunResult {
  changes: number;
  lastInsertRowid: number | string;
}

export class SQLiteManager {
  private db: Database; // sql.js Database instance
  private dbPath: string;
  private savepointCounter = 0;
  private transactionDepth = 0;
  private persistTimer: NodeJS.Timeout | null = null;
  private pendingPersist = false;
  private readonly PERSIST_DELAY_MS = 1000; // Persist after 1 second of inactivity

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  /**
   * Static factory to handle async WASP initialization
   */
  public static async create(dbPath: string): Promise<SQLiteManager> {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db: any;

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      logger.info({ db: dbPath }, "database loaded from disk");
    } else {
      db = new SQL.Database();
      logger.info({ db: dbPath }, "new database created in memory");
    }

    const manager = new SQLiteManager(db, dbPath);
    manager.runMigrations();

    // Initial persist to ensure file exists
    manager.persist();

    logger.info({ db: dbPath }, "database ready (WASM)");
    return manager;
  }

  private runMigrations(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const version = parseInt(file.split("_")[0], 10);
      const already = this.get<{ one: number }>(
        "SELECT 1 AS one FROM schema_migrations WHERE version = ?",
        [version]
      );

      if (!already) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

        // Skip FTS5 migrations if not supported (sql.js doesn't support FTS5)
        if (file.includes("fts")) {
          try {
            // Test if FTS5 is available
            this.db.run("CREATE VIRTUAL TABLE IF NOT EXISTS fts_test USING fts5(test)");
            this.db.run("DROP TABLE IF EXISTS fts_test");
            // FTS5 is available, proceed with migration
            this.db.run(sql);
            this.run("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", [version, file]);
            logger.info({ migration: file }, "migration applied");
          } catch (err) {
            logger.warn({ migration: file, err }, "FTS5 not supported, skipping migration");
            // Mark as applied so we don't try again
            this.run("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", [version, file]);
          }
        } else {
          // Non-FTS migration, apply normally
          this.db.run(sql);
          this.run("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", [version, file]);
          logger.info({ migration: file }, "migration applied");
        }
      }
    }
  }

  /**
   * Rollback to a specific migration version.
   * Requires rollback SQL files named like: 003_rollback.sql
   */
  public rollbackMigration(targetVersion: number): void {
    const migrationsDir = path.join(__dirname, "migrations");
    if (!fs.existsSync(migrationsDir)) {
      throw new Error("Migrations directory not found");
    }

    // Get applied migrations in reverse order
    const applied = this.all<{ version: number; name: string }>(
      "SELECT version, name FROM schema_migrations ORDER BY version DESC"
    );

    if (applied.length === 0) {
      throw new Error("No migrations applied to rollback");
    }

    const latestVersion = applied[0].version;
    if (targetVersion >= latestVersion) {
      throw new Error(`Target version ${targetVersion} is not earlier than current version ${latestVersion}`);
    }

    // Rollback migrations in reverse order
    for (const migration of applied) {
      if (migration.version <= targetVersion) break;

      const rollbackFile = path.join(migrationsDir, `${migration.version.toString().padStart(3, '0')}_rollback.sql`);
      if (!fs.existsSync(rollbackFile)) {
        throw new Error(`Rollback file not found for migration ${migration.version}: ${rollbackFile}`);
      }

      try {
        const rollbackSql = fs.readFileSync(rollbackFile, "utf-8");
        this.db.run(rollbackSql);
        this.run("DELETE FROM schema_migrations WHERE version = ?", [migration.version]);
        logger.info({ migration: migration.name, version: migration.version }, "migration rolled back");
      } catch (err) {
        logger.error({ migration: migration.name, err }, "migration rollback failed");
        throw new Error(`Failed to rollback migration ${migration.version}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.flushPersist();
  }

  private persist(): void {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this.pendingPersist = false;
    } catch (err) {
      logger.error({ err }, "database persistence failed");
      throw err; // Propagate error for proper error handling
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.pendingPersist = true;
    this.persistTimer = setTimeout(() => {
      this.persist();
    }, this.PERSIST_DELAY_MS);
  }

  private flushPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.pendingPersist) {
      this.persist();
    }
  }

  public run(sql: string, params: unknown[] = []): RunResult {
    this.db.run(sql, params as any);
    // Only schedule persist if not in a transaction to prevent partial writes
    if (this.transactionDepth === 0) {
      this.schedulePersist();
    }

    // sql.js doesn't easily return changes/lastID from .run() without additional calls
    // We can simulate them if needed, but for now we return a generic result
    return {
      changes: 1, // Mock
      lastInsertRowid: 0 // Mock
    };
  }

  public get<T>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as any);
    const result = stmt.step() ? (stmt.getAsObject() as T) : undefined;
    stmt.free();
    return result;
  }

  public all<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as any);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  public exec(sql: string): void {
    this.db.run(sql);
    // Only schedule persist if not in a transaction to prevent partial writes
    if (this.transactionDepth === 0) {
      this.schedulePersist();
    }
  }

  /**
   * Compatibility wrapper for better-sqlite3 prepare().run/get/all
   */
  public prepare(sql: string) {
    return {
      run: (...params: unknown[]) => this.run(sql, params),
      get: (...params: unknown[]) => this.get(sql, params),
      all: (...params: unknown[]) => this.all(sql, params),
    };
  }

  public transaction<T>(fn: () => T): T {
    const sp = `sp_${++this.savepointCounter}`;
    this.transactionDepth++;
    this.exec(`SAVEPOINT ${sp}`);
    try {
      const result = fn();
      this.exec(`RELEASE ${sp}`);
      this.transactionDepth--;
      this.flushPersist(); // Immediate sync after successful transaction
      return result;
    } catch (err) {
      this.exec(`ROLLBACK TO ${sp}`);
      this.exec(`RELEASE ${sp}`);
      this.transactionDepth--;
      // Do NOT persist on rollback to prevent writing partial/invalid state
      throw err;
    }
  }

  public close(): void {
    this.flushPersist();
    this.db.close();
    logger.info("database closed");
  }

  public executeMaintenance(): void {
    logger.info("starting database maintenance");
    this.db.run("VACUUM");
    this.db.run("ANALYZE");
    try {
      this.db.run("INSERT INTO nodes_fts(nodes_fts) VALUES('optimize')");
      logger.info("FTS5 table optimized");
    } catch (err) {
      logger.warn({ err }, "FTS5 optimization skipped");
    }
    this.flushPersist();
    logger.info("database maintenance complete");
  }

  public checkIntegrity(): string[] {
    const results = this.all<{ integrity_check: string }>("PRAGMA integrity_check");
    return results.map(r => r.integrity_check);
  }

  public hasPendingWrites(): boolean {
    return this.pendingPersist;
  }

  /**
   * Creates a backup of the database to the specified path.
   * Flushes any pending writes before creating the backup.
   */
  public backup(backupPath: string): void {
    try {
      // Ensure all pending writes are flushed before backup
      this.flushPersist();

      const data = this.db.export();
      const buffer = Buffer.from(data);
      const backupDir = path.dirname(backupPath);

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      fs.writeFileSync(backupPath, buffer);
      logger.info({ from: this.dbPath, to: backupPath }, "database backup created");
    } catch (err) {
      logger.error({ err, backupPath }, "database backup failed");
      throw err;
    }
  }

  /**
   * Restores the database from a backup file.
   * Note: This will replace the current database in memory.
   * The caller is responsible for calling persist() if they want the restored state saved.
   */
  public restore(backupPath: string): void {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      const fileBuffer = fs.readFileSync(backupPath);
      this.db = new (this.db.constructor as any)(fileBuffer);

      // Clear any pending writes since we've replaced the database
      this.pendingPersist = false;
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }

      logger.info({ from: backupPath, to: this.dbPath }, "database restored from backup");
    } catch (err) {
      logger.error({ err, backupPath }, "database restore failed");
      throw err;
    }
  }
}
