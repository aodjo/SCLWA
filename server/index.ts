import { serve } from '@hono/node-server';
import { ensureDockerReady } from './services/docker-runner.js';
import { app } from './app.js';
import { HOST, PORT } from './config.js';

serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    process.stdout.write(`Web mode: http://${info.address}:${info.port}\n`);
  }
);

void ensureDockerReady().catch(() => {
  // Background warmup only.
});
