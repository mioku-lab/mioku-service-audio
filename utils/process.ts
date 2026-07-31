import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

export interface RunProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface SpawnDetachedOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logPrefix?: string;
  stdoutPath?: string;
  stderrPath?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface SpawnHandle {
  child: ChildProcess;
  pid: number | undefined;
}

export function spawnDetached(
  command: string,
  args: string[],
  options: SpawnDetachedOptions = {},
): SpawnHandle {
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    windowsHide: true,
  };

  const child = spawn(command, args, spawnOptions);

  if (options.onStdoutLine && child.stdout) {
    pipeWithLineSplit(child.stdout, (line) => options.onStdoutLine!(line));
  }
  if (options.onStderrLine && child.stderr) {
    pipeWithLineSplit(child.stderr, (line) => options.onStderrLine!(line));
  }
  child.on("exit", (code, signal) => {
    options.onExit?.(code, signal);
  });

  return { child, pid: child.pid };
}

function pipeWithLineSplit(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): void {
  let buffer = "";
  stream.setEncoding("utf-8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) onLine(line);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) onLine(buffer);
    buffer = "";
  });
}
