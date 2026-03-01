import Docker from 'dockerode';
import { ExecutionResult, TestCaseResult, TestResult } from './types';

const DOCKER_IMAGE = 'gcc:latest';
const EXECUTION_TIMEOUT = 10000; // 10 seconds
const MEMORY_LIMIT = 128 * 1024 * 1024; // 128MB

/**
 * Docker-based C code executor
 */
export class CodeExecutor {
  private docker: Docker;
  private imageReady: boolean = false;

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Ensures the GCC Docker image is available
   */
  async ensureImage(): Promise<void> {
    if (this.imageReady) return;

    try {
      await this.docker.getImage(DOCKER_IMAGE).inspect();
      this.imageReady = true;
    } catch {
      console.log(`Pulling Docker image: ${DOCKER_IMAGE}`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(DOCKER_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) return reject(err);
            this.imageReady = true;
            resolve();
          });
        });
      });
    }
  }

  /**
   * Executes C code and returns the output
   *
   * @param code - C source code to execute
   * @param input - Standard input for the program
   * @returns Execution result with output or error
   */
  async execute(code: string, input: string = ''): Promise<ExecutionResult> {
    await this.ensureImage();

    const compileAndRun = `
cat > /tmp/main.c << 'CCODE'
${code}
CCODE
gcc /tmp/main.c -o /tmp/main 2>&1 && echo '---COMPILE_SUCCESS---' && echo '${input.replace(/'/g, "'\\''")}' | /tmp/main
`;

    try {
      const container = await this.docker.createContainer({
        Image: DOCKER_IMAGE,
        Cmd: ['bash', '-c', compileAndRun],
        AttachStdout: true,
        AttachStderr: true,
        NetworkDisabled: true,
        HostConfig: {
          Memory: MEMORY_LIMIT,
          MemorySwap: MEMORY_LIMIT,
          CpuPeriod: 100000,
          CpuQuota: 50000, // 50% CPU
          AutoRemove: true,
        },
      });

      await container.start();

      const output = await this.waitForContainer(container);

      if (output.includes('---COMPILE_SUCCESS---')) {
        const parts = output.split('---COMPILE_SUCCESS---');
        const programOutput = parts[1]?.trim() ?? '';
        return {
          success: true,
          output: programOutput,
          exitCode: 0,
        };
      } else {
        return {
          success: false,
          output: '',
          error: output.trim(),
          exitCode: 1,
        };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
      };
    }
  }

  /**
   * Runs code against multiple test cases
   *
   * @param code - C source code to test
   * @param testCases - Array of test cases with input and expected output
   * @returns Test result with pass/fail status for each case
   */
  async runTestCases(
    code: string,
    testCases: { input: string; expected: string }[]
  ): Promise<TestResult> {
    const results: TestCaseResult[] = [];
    let compilationError: string | undefined;

    for (const testCase of testCases) {
      const result = await this.execute(code, testCase.input);

      if (!result.success) {
        compilationError = result.error;
        results.push({
          input: testCase.input,
          expected: testCase.expected,
          actual: result.error ?? '',
          passed: false,
        });
        continue;
      }

      const passed = result.output.trim() === testCase.expected.trim();
      results.push({
        input: testCase.input,
        expected: testCase.expected,
        actual: result.output,
        passed,
      });
    }

    return {
      allPassed: results.every((r) => r.passed),
      results,
      compilationError,
    };
  }

  /**
   * Waits for container to finish and returns output
   *
   * @param container - Docker container instance
   * @returns Container output as string
   */
  private async waitForContainer(container: Docker.Container): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        try {
          await container.kill();
        } catch {
          // Container may have already stopped
        }
        reject(new Error('Execution timeout'));
      }, EXECUTION_TIMEOUT);

      container.wait(async (err: Error | null) => {
        clearTimeout(timeout);
        if (err) return reject(err);

        try {
          const logs = await container.logs({
            stdout: true,
            stderr: true,
          });
          resolve(this.demuxDockerStream(logs));
        } catch (logErr) {
          reject(logErr);
        }
      });
    });
  }

  /**
   * Demultiplexes Docker stream output by removing 8-byte headers
   *
   * @param buffer - Raw Docker logs buffer
   * @returns Clean output string
   */
  private demuxDockerStream(buffer: Buffer): string {
    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;

      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + size > buffer.length) break;

      chunks.push(buffer.subarray(offset, offset + size));
      offset += size;
    }

    return Buffer.concat(chunks).toString('utf8');
  }
}

export const codeExecutor = new CodeExecutor();
