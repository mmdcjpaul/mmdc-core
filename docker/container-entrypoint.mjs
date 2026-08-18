#!/usr/bin/env node

import { spawn } from 'node:child_process';

const command = process.argv[2] ?? 'web';
const arguments_ = process.argv.slice(3);

const commandLine = (() => {
  switch (command) {
    case 'web':
      return [process.execPath, ['/app/server.js', ...arguments_]];
    case 'worker':
      return [process.execPath, ['--experimental-strip-types', '/app/scripts/payload-worker.mjs', ...arguments_]];
    case 'exec':
      if (arguments_.length === 0) throw new Error('exec requires a command');
      return [arguments_[0], arguments_.slice(1)];
    default:
      throw new Error(`unknown runtime command: ${command}; expected web, worker, or exec`);
  }
})();

const [executable, executableArguments] = commandLine;
const child = spawn(executable, executableArguments, {
  env: process.env,
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.log(JSON.stringify({ event: 'runtime.signal', command, signal }));
    if (!child.killed) child.kill(signal);
  });
}

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});

process.exitCode = exitCode;
