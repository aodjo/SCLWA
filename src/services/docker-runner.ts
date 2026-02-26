import { spawn } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CompileResult } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = join(__dirname, '../../temp');
const TIMEOUT_SECONDS = 5;
const DOCKER_IMAGE = 'c-tutor-runner';

/**
 * Docker 이미지가 존재하는지 확인
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
 * Docker 이미지 빌드
 */
async function buildDockerImage(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['build', '-t', DOCKER_IMAGE, '.'], {
      cwd: join(__dirname, '../..'),
      stdio: 'inherit',
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Docker build failed with code ${code}`));
    });
  });
}

/**
 * C 코드를 Docker 컨테이너에서 컴파일하고 실행
 */
export async function runCCode(code: string): Promise<CompileResult> {
  // temp 디렉토리 생성
  await mkdir(TEMP_DIR, { recursive: true });

  // 코드를 파일로 저장
  const sourceFile = join(TEMP_DIR, 'main.c');
  const outputFile = join(TEMP_DIR, 'main');

  await writeFile(sourceFile, code, 'utf-8');

  // Docker 이미지 확인/빌드
  const imageExists = await checkDockerImage();
  if (!imageExists) {
    try {
      await buildDockerImage();
    } catch (err) {
      return {
        success: false,
        error: 'Failed to build Docker image. Is Docker running?',
        exitCode: -1,
      };
    }
  }

  // Docker에서 컴파일 및 실행
  return new Promise((resolve) => {
    const command = `gcc /code/main.c -o /code/main && timeout ${TIMEOUT_SECONDS}s /code/main`;

    const proc = spawn('docker', [
      'run',
      '--rm',
      '-v', `${TEMP_DIR}:/code`,
      '--network', 'none',
      '--memory', '128m',
      '--cpus', '0.5',
      DOCKER_IMAGE,
      'sh', '-c', command,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      // 임시 파일 정리
      try {
        await rm(sourceFile, { force: true });
        await rm(outputFile, { force: true });
      } catch {
        // ignore cleanup errors
      }

      if (code === 0) {
        resolve({
          success: true,
          output: stdout.trim() || '(no output)',
          exitCode: code,
        });
      } else if (code === 124) {
        // timeout exit code
        resolve({
          success: false,
          error: 'Timeout: Code execution exceeded time limit (infinite loop?)',
          exitCode: code,
        });
      } else {
        resolve({
          success: false,
          error: stderr.trim() || `Compilation/execution failed (exit code: ${code})`,
          exitCode: code ?? -1,
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
 * Docker 없이 로컬 gcc로 실행 (폴백)
 */
export async function runCCodeLocal(code: string): Promise<CompileResult> {
  await mkdir(TEMP_DIR, { recursive: true });

  const sourceFile = join(TEMP_DIR, 'main.c');
  const outputFile = join(TEMP_DIR, 'main.exe');

  await writeFile(sourceFile, code, 'utf-8');

  return new Promise((resolve) => {
    // 컴파일
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

      // 실행
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
        // 정리
        try {
          await rm(sourceFile, { force: true });
          await rm(outputFile, { force: true });
        } catch {
          // ignore
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
