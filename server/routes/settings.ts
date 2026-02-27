import type { Hono } from 'hono';
import {
  clearAllData,
  loadGeminiApiKey,
  loadProgress,
  saveGeminiApiKey,
} from '../services/storage.js';
import { jsonError, readJsonBody } from '../utils/http.js';

/**
 * Registers progress and settings routes.
 *
 * @param {Hono} app - Hono application instance.
 * @returns {void} Routes are mounted on `app`.
 */
export function registerSettingsRoutes(app: Hono): void {
  app.get('/api/progress', async (c) => {
    const progress = await loadProgress();
    return c.json({ progress });
  });

  app.get('/api/settings/gemini-key', async (c) => {
    const apiKey = await loadGeminiApiKey();
    return c.json({ configured: Boolean(apiKey) });
  });

  app.post('/api/settings/gemini-key', async (c) => {
    const body = await readJsonBody<{ apiKey?: string }>(c);
    const apiKey = (body.apiKey || '').trim();
    if (!apiKey) {
      return jsonError(c, 400, 'API key is required.');
    }

    await saveGeminiApiKey(apiKey);
    return c.json({ success: true });
  });

  app.post('/api/settings/reset', async (c) => {
    await clearAllData();
    return c.json({ success: true });
  });
}
