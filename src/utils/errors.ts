export type ErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "INVALID_INPUT"
  | "RESOURCE_EXHAUSTED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(err: unknown): { success: false; error: string; code: ErrorCode } {
  if (err instanceof AppError) {
    return { success: false, error: err.message, code: err.code };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: msg, code: "INTERNAL_ERROR" };
}

export function toolResult(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
