import { Hono } from 'hono';
import { registerAssessmentRoutes } from './routes/assessment.js';
import { registerPuzzleRoutes } from './routes/puzzle.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerStaticRoute } from './routes/static.js';
import { registerTutorRoutes } from './routes/tutor.js';
import { toErrorMessage } from './utils/http.js';

/**
 * Creates and configures the Hono application.
 *
 * @returns {Hono} Configured Hono app instance.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.onError((error, c) => {
    return c.json({ error: toErrorMessage(error) }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, mode: 'web' }));

  registerSettingsRoutes(app);
  registerTutorRoutes(app);
  registerPuzzleRoutes(app);
  registerAssessmentRoutes(app);
  registerStaticRoute(app);

  return app;
}

export const app = createApp();
