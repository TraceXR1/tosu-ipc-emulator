const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const STYLES = { boldBlue: '1;34', boldRed: '1;31', yellow: '33', dim: '2' };

function style(name, text) {
  return useColor ? `\x1b[${STYLES[name]}m${text}\x1b[0m` : text;
}

function log(message) {
  console.log(message);
}

function warn(message) {
  console.warn(style('yellow', message));
}

function error(message) {
  console.error(style('boldRed', message));
}

function debug(message) {
  console.log(style('dim', message));
}

function tosu(line, isStderr) {
  const print = isStderr ? console.error : console.log;
  print(`${style('boldBlue', '[tosu]')} ${line}`);
}

export { log, warn, error, debug, tosu };
