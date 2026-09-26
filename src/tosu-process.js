import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import * as logger from './logger.js';
import { baseDir } from './paths.js';
import { isShuttingDown } from './shutdown.js';

const execFileAsync = promisify(execFile);

const IS_WINDOWS = process.platform === 'win32';
const PROCESS_NAME = IS_WINDOWS ? 'tosu.exe' : 'tosu';
const STOP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 200;

const BINARY_PATH = path.join(baseDir, PROCESS_NAME);

let child = null;

function binaryExists() {
  try {
    return fs.statSync(BINARY_PATH).isFile();
  } catch {
    return false;
  }
}

async function isRunning() {
  if (IS_WINDOWS) {
    const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${PROCESS_NAME}`, '/FO', 'CSV', '/NH']);
    return stdout.toLowerCase().includes(`"${PROCESS_NAME}"`);
  }

  try {
    await execFileAsync('pgrep', ['-x', PROCESS_NAME]);
    return true;
  } catch (error) {
    // pgrep exits with code 1 when nothing matches
    if (error.code === 1) return false;
    throw error;
  }
}

function killByName(force) {
  return IS_WINDOWS
    ? execFileAsync('taskkill', ['/F', '/IM', PROCESS_NAME])
    : execFileAsync('pkill', [force ? '-KILL' : '-TERM', '-x', PROCESS_NAME]);
}

async function waitUntilGone(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isRunning())) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return !(await isRunning());
}

async function stopExisting() {
  if (!(await isRunning())) return;

  logger.log('Found a running tosu instance, stopping it...');
  await killByName(false).catch(() => {});
  if (await waitUntilGone(STOP_TIMEOUT_MS)) return;

  await killByName(true).catch(() => {});
  if (!(await waitUntilGone(STOP_TIMEOUT_MS))) {
    throw new Error('the existing instance did not stop');
  }
}

function forwardLines(stream, isStderr) {
  readline.createInterface({ input: stream }).on('line', (line) => logger.tosu(line, isStderr));
}

function handleSpawnError(error) {
  child = null;
  logger.error(`Failed to start tosu: ${error.message}`);
  if (error.code === 'EACCES') logger.log('Check that the tosu binary is executable (chmod +x).');
}

function handleExit(code, signal) {
  child = null;
  if (!isShuttingDown()) {
    logger.warn(`tosu exited unexpectedly (code: ${code}, signal: ${signal})`);
  }
}

function killSync() {
  if (child) child.kill('SIGKILL');
}

async function start() {
  if (!binaryExists()) {
    logger.error('tosu binary was not found!');
    logger.log(`Expected location: ${BINARY_PATH}`);
    logger.log('Check that the tosu binary exists and is placed in the same directory as this program.');
    return false;
  }

  try {
    await stopExisting();
  } catch (error) {
    logger.warn(`Could not stop the existing tosu: ${error.message}`);
  }

  logger.log('Starting tosu...');
  child = spawn(BINARY_PATH, [], { cwd: baseDir, stdio: ['ignore', 'pipe', 'pipe'] });
  forwardLines(child.stdout, false);
  forwardLines(child.stderr, true);
  child.on('error', handleSpawnError);
  child.on('exit', handleExit);

  // Last resort against an orphaned tosu, exit handlers must be synchronous
  process.once('exit', killSync);
  return true;
}

function stop() {
  const current = child;
  if (!current) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => current.kill('SIGKILL'), STOP_TIMEOUT_MS);
    current.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    current.kill('SIGTERM');
  });
}

export { start, stop };
