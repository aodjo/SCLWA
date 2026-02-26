#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { ensureGeminiApiKey } from './services/gemini-key-setup.js';

/**
 * Bootstraps the Ink CLI application renderer.
 *
 * @return {void} Starts rendering the root app.
 */
async function bootstrap(): Promise<void> {
  await ensureGeminiApiKey();
  render(<App />, {
    exitOnCtrlC: false, // handle Ctrl+C manually in app
  });
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`앱 시작 실패: ${message}`);
  process.exit(1);
});
