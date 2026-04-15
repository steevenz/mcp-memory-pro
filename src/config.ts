import path from "path";

// Resolve project root as one level up from src/ or dist/
const PROJECT_ROOT = path.resolve(__dirname, "..");

export const config = {
  data_dir: process.env.MCP_DATA_DIR ?? path.join(PROJECT_ROOT, "data"),
  db_name:  process.env.MCP_DB_NAME  ?? "memory.sqlite",
  log_level: (process.env.MCP_LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
};

export const DB_PATH = path.join(config.data_dir, config.db_name);
