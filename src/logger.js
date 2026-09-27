const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const STYLES = { boldBlue: '1;34', boldRed: '1;31', yellow: '33', green: '32' };

// Matches tosu's own log line width: 15 characters before the bar
const PREFIX = '[ipc-emulator]'.padEnd(15);
const BAR = '┃';
const startTime = process.hrtime.bigint();

function style(name, text) {
  return useColor ? `\x1b[${STYLES[name]}m${text}\x1b[0m` : text;
}

function uptime() {
  const totalMs = Number((process.hrtime.bigint() - startTime) / 1_000_000n);
  const h = String(Math.floor(totalMs / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor(totalMs / 60_000) % 60).padStart(2, '0');
  const s = String(Math.floor(totalMs / 1000) % 60).padStart(2, '0');
  const ms = String(totalMs % 1000).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function formatLine(barStyle, message) {
  return `${style('boldBlue', PREFIX)}${style(barStyle, BAR)}  ${uptime()}  ${message}`;
}

function log(message) {
  console.log(formatLine('green', message));
}

function warn(message) {
  console.warn(formatLine('yellow', message));
}

function error(message) {
  console.error(formatLine('boldRed', message));
}

function tosu(line, isStderr) {
  const print = isStderr ? console.error : console.log;
  print(`${style('boldBlue', '[tosu]')} ${line}`);
}

export { log, warn, error, tosu };
