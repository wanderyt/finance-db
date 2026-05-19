/**
 * Pagination constants shared by every read-only repository that backs the
 * MCP server. The DB is single-user (user_id = 1) and MCP responses ship
 * inline, so we cap row counts to keep payloads tractable.
 */
export const DEFAULT_USER_ID = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}
