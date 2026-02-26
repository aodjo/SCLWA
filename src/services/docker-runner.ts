import { spawn } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CompileResult } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '../../temp');
const TIMEOUT_SECONDS = 5;
const DOCKER_IMAGE = 'c-tutor-runner';
const DOCKER_SMOKE_OUTPUT = 'docker-ready';
let dockerImageReady = false;
let dockerRuntimeReady = false;
type DockerLogListener = (line: string) => void;
const dockerLogListeners = new Set<DockerLogListener>();

/**
 * Subscribes to docker lifecycle logs emitted by runner helpers.
 *
 * @param {DockerLogListener} listener - Log listener callback.
 * @return {() => void} Unsubscribe callback.
 */
export function subscribeDockerLogs(listener: DockerLogListener): () => void {
  dockerLogListeners.add(listener);
  return () => {
    dockerLogListeners.delete(listener);
  };
}

/**
 * Publishes one log line to all docker log listeners.
 *
 * @param {string} line - Log line text.
 * @return {void} Dispatches log line.
 */
function emitDockerLog(line: string): void {
  const normalized = line.replace(/\r/g, '').trim();
  if (!normalized) {
    return;
  }

  for (const listener of dockerLogListeners) {
    listener(normalized);
  }
}

/**
 * Pipes process stream output into docker log listeners line-by-line.
 *
 * @param {NodeJS.ReadableStream} stream - Process output stream.
 * @param {string} prefix - Prefix text per emitted line.
 * @return {void} Attaches listeners to stream.
 */
function pipeStreamToDockerLogs(stream: NodeJS.ReadableStream, prefix: string): void {
  let buffer = '';
  stream.on('data', (chunk: Buffer | string) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      emitDockerLog(`${prefix}${line}`);
    }
  });
  stream.on('end', () => {
    if (buffer.trim()) {
      emitDockerLog(`${prefix}${buffer}`);
    }
  });
}

/**
 * Checks whether the required Docker image already exists locally.
 *
 * @return {Promise<boolean>} `true` when the image is available.
 */
async function checkDockerImage(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['image', 'inspect', DOCKER_IMAGE], {
      stdio: 'pipe',
    });
    proc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Builds the local Docker image used to compile and run C code safely.
 *
 * @return {Promise<void>} Resolves on successful image build.
 */
async function buildDockerImage(): Promise<void> {
  emitDockerLog('Docker 이미지 빌드 시작...');

  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['build', '-t', DOCKER_IMAGE, '.'], {
      cwd: join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    pipeStreamToDockerLogs(proc.stdout, '[docker build] ');
    pipeStreamToDockerLogs(proc.stderr, '[docker build] ');

    proc.on('close', (code) => {
      if (code === 0) {
        emitDockerLog('Docker 이미지 빌드 완료.');
        resolve();
      } else {
        emitDockerLog(`Docker 이미지 빌드 실패 (code: ${code}).`);
        reject(new Error(`Docker build failed with code ${code}`));
      }
    });
    proc.on('error', (error) => {
      emitDockerLog(`Docker 빌드 실행 오류: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Ensures Docker image for execution exists locally.
 *
 * @return {Promise<void>} Resolves when execution image is available.
 */
async function ensureDockerImageReady(): Promise<void> {
  if (dockerImageReady) {
    emitDockerLog('Docker 이미지 캐시 사용.');
    return;
  }

  emitDockerLog('Docker 이미지 확인 중...');
  const imageExists = await checkDockerImage();
  if (!imageExists) {
    emitDockerLog('Docker 이미지가 없어 새로 빌드합니다.');
    await buildDockerImage();
  } else {
    emitDockerLog('Docker 이미지가 이미 존재합니다.');
  }

  dockerImageReady = true;
}

/**
 * Compiles and runs C code inside an isolated Docker container.
 *
 * @param {string} code - C source code to compile and execute.
 * @return {Promise<CompileResult>} Execution result including output or error details.
 */
export async function runCCode(code: string): Promise<CompileResult> {
  await mkdir(TEMP_DIR, { recursive: true });

  const sourceFile = join(TEMP_DIR, 'main.c');
  const outputFile = join(TEMP_DIR, 'main');

  await writeFile(sourceFile, code, 'utf-8');

  try {
    await ensureDockerImageReady();
  } catch {
    return {
      success: false,
      error: 'Failed to build Docker image. Is Docker running?',
      exitCode: -1,
    };
  }

  return new Promise((resolve) => {
    const command = `gcc /code/main.c -o /code/main && timeout ${TIMEOUT_SECONDS}s /code/main`;

    const proc = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${TEMP_DIR}:/code`,
        '--network',
        'none',
        '--memory',
        '128m',
        '--cpus',
        '0.5',
        DOCKER_IMAGE,
        'sh',
        '-c',
        command,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (codeValue) => {
      try {
        await rm(sourceFile, { force: true });
        await rm(outputFile, { force: true });
      } catch {
        // Ignore cleanup errors.
      }

      if (codeValue === 0) {
        resolve({
          success: true,
          output: stdout.trim() || '(no output)',
          exitCode: codeValue,
        });
      } else if (codeValue === 124) {
        resolve({
          success: false,
          error: 'Timeout: Code execution exceeded time limit (infinite loop?)',
          exitCode: codeValue,
        });
      } else {
        resolve({
          success: false,
          error: stderr.trim() || `Compilation/execution failed (exit code: ${codeValue})`,
          exitCode: codeValue ?? -1,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        error: `Docker error: ${err.message}. Is Docker running?`,
        exitCode: -1,
      });
    });
  });
}

/**
 * Prepares Docker runtime once at startup and validates execution with a smoke test.
 *
 * @return {Promise<void>} Resolves when Docker execution is fully ready.
 */
export async function ensureDockerReady(): Promise<void> {
  if (dockerRuntimeReady) {
    emitDockerLog('Docker 런타임 연결됨 (캐시).');
    return;
  }

  try {
    await ensureDockerImageReady();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Docker 준비 실패: ${message}`);
  }

  emitDockerLog('Docker 실행 스모크 테스트 시작...');
  const smokeCode = '#include <stdio.h>\nint main() { printf("docker-ready"); return 0; }';
  const smokeResult = await runCCode(smokeCode);
  if (!smokeResult.success) {
    emitDockerLog(`Docker 실행 스모크 테스트 실패: ${smokeResult.error || 'unknown error'}`);
    throw new Error(`Docker 실행 확인 실패: ${smokeResult.error || 'unknown error'}`);
  }

  if ((smokeResult.output || '').trim() !== DOCKER_SMOKE_OUTPUT) {
    emitDockerLog(`Docker 실행 스모크 테스트 출력 불일치: ${smokeResult.output || '(empty)'}`);
    throw new Error(`Docker 실행 출력이 예상과 다릅니다: ${smokeResult.output || '(empty)'}`);
  }

  emitDockerLog('Docker 실행 준비 완료.');
  dockerRuntimeReady = true;
}

/**
 * Compiles and runs C code locally via `gcc` as a fallback when Docker is unavailable.
 *
 * @param {string} code - C source code to compile and execute.
 * @return {Promise<CompileResult>} Execution result including output or error details.
 */
export async function runCCodeLocal(code: string): Promise<CompileResult> {
  await mkdir(TEMP_DIR, { recursive: true });

  const sourceFile = join(TEMP_DIR, 'main.c');
  const outputFile = join(TEMP_DIR, 'main.exe');

  await writeFile(sourceFile, code, 'utf-8');

  return new Promise((resolve) => {
    const compile = spawn('gcc', [sourceFile, '-o', outputFile], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let compileErr = '';
    compile.stderr.on('data', (data) => {
      compileErr += data.toString();
    });

    compile.on('close', (compileCode) => {
      if (compileCode !== 0) {
        resolve({
          success: false,
          error: compileErr.trim() || 'Compilation failed',
          exitCode: compileCode ?? -1,
        });
        return;
      }

      const run = spawn(outputFile, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: TIMEOUT_SECONDS * 1000,
      });

      let stdout = '';
      let stderr = '';

      run.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      run.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      run.on('close', async (runCode) => {
        try {
          await rm(sourceFile, { force: true });
          await rm(outputFile, { force: true });
        } catch {
          // Ignore cleanup errors.
        }

        if (runCode === 0) {
          resolve({
            success: true,
            output: stdout.trim() || '(no output)',
            exitCode: runCode,
          });
        } else {
          resolve({
            success: false,
            error: stderr.trim() || `Runtime error (exit code: ${runCode})`,
            exitCode: runCode ?? -1,
          });
        }
      });

      run.on('error', (err) => {
        resolve({
          success: false,
          error: `Execution error: ${err.message}`,
          exitCode: -1,
        });
      });
    });

    compile.on('error', (err) => {
      resolve({
        success: false,
        error: `GCC not found: ${err.message}. Install gcc or use Docker.`,
        exitCode: -1,
      });
    });
  });
}
