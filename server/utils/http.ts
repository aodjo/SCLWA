import type { Context } from 'hono';

/**
 * Converts unknown error values into safe text.
 *
 * @param {unknown} error - Unknown error payload.
 * @returns {string} Stringified error message.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends a JSON error response.
 *
 * @param {Context} c - Hono request context.
 * @param {number} status - HTTP status code.
 * @param {string} message - Error message.
 * @returns {Response} JSON error response.
 */
export function jsonError(c: Context, status: number, message: string): Response {
  return c.json({ error: message }, status);
}

/**
 * Reads JSON request body and returns empty object on parse failures.
 *
 * @template T
 * @param {Context} c - Hono request context.
 * @returns {Promise<T>} Parsed body object.
 */
export async function readJsonBody<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    return {} as T;
  }
}
