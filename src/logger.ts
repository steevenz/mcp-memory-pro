import pino from "pino";
import { config } from "./config";

// MCP uses stdout for protocol messages — logger MUST write to stderr only
export const logger = pino(
  {
    level: config.log_level,
    base: { service: "mcp-memory-pro" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({ dest: 2, sync: true }) // fd 2 = stderr
);
