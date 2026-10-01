import fs from 'node:fs';
import path from 'node:path';

import * as logger from './logger.js';
import { baseDir } from './paths.js';
import { StateMachine } from './state-machine.js';

const IPC_DIR = path.join(baseDir, 'ipc');
const FILES = {
  main: path.join(IPC_DIR, 'ipc.txt'),
  scores: path.join(IPC_DIR, 'ipc-scores.txt'),
  channel: path.join(IPC_DIR, 'ipc-channel.txt'),
  state: path.join(IPC_DIR, 'ipc-state.txt'),
};

const STATE_LABELS = { idle: 'Idle', playing: 'Playing', ranking: 'Ranking' };

const lastWritten = new Map();

function formatLine(value) {
  return value === undefined || value === null ? '' : String(value);
}

function writeIfChanged(filePath, content) {
  if (lastWritten.get(filePath) === content) return;

  try {
    fs.writeFileSync(filePath, content);
  } catch (error) {
    logger.error(`Failed to write ${filePath}: ${error.message}`);
    return;
  }

  lastWritten.set(filePath, content);
}

function ensureFiles() {
  fs.mkdirSync(IPC_DIR, { recursive: true });

  const defaults = {
    [FILES.main]: '\n\n',
    [FILES.scores]: '\n\n',
    [FILES.channel]: '\n',
    [FILES.state]: `${STATE_LABELS.idle}\n`,
  };

  for (const [filePath, content] of Object.entries(defaults)) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content);
    lastWritten.set(filePath, fs.readFileSync(filePath, 'utf8'));
  }
}

function updateBeatmapAndScores(data) {
  writeIfChanged(FILES.main, `${formatLine(data.beatmap?.id)}\n${formatLine(data.room?.requiredMods?.number)}\n`);
  writeIfChanged(FILES.scores, `${formatLine(data.tourney?.totalScore?.left)}\n${formatLine(data.tourney?.totalScore?.right)}\n`);
  writeIfChanged(FILES.channel, `${formatLine(data.room?.channelID)}\n`);
}

const stateMachine = new StateMachine((status) => writeIfChanged(FILES.state, `${STATE_LABELS[status]}\n`));

function update(data) {
  updateBeatmapAndScores(data);
  stateMachine.update({
    stateName: data.state?.name,
    live: data.beatmap?.time?.live,
    lastObject: data.beatmap?.time?.lastObject,
  });
}

function stop() {
  stateMachine.stop();
}

export { ensureFiles, update, stop };
