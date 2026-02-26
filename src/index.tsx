#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

// 터미널 전체 화면 사용
render(<App />, {
  exitOnCtrlC: false, // 직접 처리
});
