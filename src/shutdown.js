import * as logger from './logger.js';

const SIGNALS = process.platform === 'win32'
  ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']
  : ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];

const cleanupTasks = [];
let shuttingDown = false;

function registerCleanup(task) {
  cleanupTasks.push(task);
}

function isShuttingDown() {
  return shuttingDown;
}

async function shutdown(reason, exitCode) {
  shuttingDown = true;
  logger.log(`Stopping... (${reason})`);

  for (const task of cleanupTasks) {
    try {
      await task();
    } catch (error) {
      logger.error(`Cleanup failed: ${error.message}`);
    }
  }

  process.exit(exitCode);
}

function handleSignal(signal) {
  // A repeated signal forces the exit, the exit guard in tosu-process.js still kills the child
  if (shuttingDown) process.exit(1);
  shutdown(signal, 0);
}

function handleFatal(label, error) {
  logger.error(`${label}: ${error?.stack ?? error}`);
  if (!shuttingDown) shutdown(label, 1);
}

function onStdinData(chunk) {
  // 0x03 is Ctrl+C, raw mode stops the terminal from echoing it as ^C
  if (chunk.includes(0x03)) handleSignal('SIGINT');
}

function restoreStdin() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}

function suppressCtrlCEcho() {
  if (!process.stdin.isTTY) return;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', onStdinData);
  process.on('exit', restoreStdin);
}

function installHandlers() {
  for (const signal of SIGNALS) process.on(signal, handleSignal);
  process.on('uncaughtException', (error) => handleFatal('Uncaught exception', error));
  process.on('unhandledRejection', (reason) => handleFatal('Unhandled rejection', reason));
  suppressCtrlCEcho();
}

export { installHandlers, registerCleanup, isShuttingDown };
