import fs from 'node:fs';
import path from 'node:path';

import { baseDir } from './paths.js';

const IPC_DIR = path.join(baseDir, 'ipc');
const FILES = {
  main: path.join(IPC_DIR, 'ipc.txt'),
  scores: path.join(IPC_DIR, 'ipc-scores.txt'),
  channel: path.join(IPC_DIR, 'ipc-channel.txt'),
  state: path.join(IPC_DIR, 'ipc-state.txt'),
};

const RANKING_HOLD_MS = 15000;
const STATE_LABELS = { idle: 'Idle', playing: 'Playing', ranking: 'Ranking' };

const lastWritten = new Map();
let status = 'idle';
let rankingTimer = null;

function formatLine(value) {
  return value === undefined || value === null ? '0' : String(value);
}

function writeIfChanged(filePath, content) {
  if (lastWritten.get(filePath) === content) return;
  fs.writeFileSync(filePath, content);
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

function clearRankingTimer() {
  if (!rankingTimer) return;
  clearTimeout(rankingTimer);
  rankingTimer = null;
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  writeIfChanged(FILES.state, `${STATE_LABELS[next]}\n`);
}

function updateState(data) {
  const stateName = data.state?.name;

  if (stateName === 'spectating') {
    clearRankingTimer();
    setStatus('playing');
    return;
  }

  if (status === 'playing' && stateName === 'lobby') {
    setStatus('ranking');
    rankingTimer = setTimeout(() => {
      rankingTimer = null;
      setStatus('idle');
    }, RANKING_HOLD_MS);
    return;
  }

  // Once ranking, keep holding until the timer fires or play resumes
  if (status === 'ranking') return;

  setStatus('idle');
}

function update(data) {
  updateBeatmapAndScores(data);
  updateState(data);
}

function stop() {
  clearRankingTimer();
}

export { ensureFiles, update, stop };
