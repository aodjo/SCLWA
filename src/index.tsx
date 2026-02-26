#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

/**
 * Bootstraps the Ink CLI application renderer.
 *
 * @return {void} Starts rendering the root app.
 */
function bootstrap(): void {
  render(<App />, {
    exitOnCtrlC: false, // handle Ctrl+C manually in app
  });
}

bootstrap();
