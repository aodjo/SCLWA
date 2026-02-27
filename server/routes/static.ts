import type { Hono } from 'hono';
import { serveStatic } from '../utils/static.js';

/**
 * Registers SPA/static fallback route.
 *
 * @param {Hono} app - Hono application instance.
 * @returns {void} Catch-all route is mounted on `app`.
 */
export function registerStaticRoute(app: Hono): void {
  app.get('*', async (c) => {
    const response = await serveStatic(c.req.path);
    if (response) {
      return response;
    }
    return c.text('Not Found', 404);
  });
}
