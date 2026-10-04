const STATUS = { IDLE: 'idle', PLAYING: 'playing', RANKING: 'ranking' };
const PROGRESS = { UNKNOWN: 'unknown', RUNNING: 'running', ENDED: 'ended' };

// The only tosu state that counts as an active match
const ACTIVE_STATE = 'spectating';
const RANKING_HOLD_MS = 15000;
// Filters short glitches, like the time data resetting a moment before the state leaves spectating
const PLAYING_DELAY_MS = 500;

// Missing or invalid time data carries no information
function getMapProgress(live, lastObject) {
  if (!Number.isFinite(live) || !Number.isFinite(lastObject) || lastObject <= 0) return PROGRESS.UNKNOWN;
  return live >= lastObject ? PROGRESS.ENDED : PROGRESS.RUNNING;
}

class StateMachine {
  constructor(onChange) {
    this.onChange = onChange;
    this.status = STATUS.IDLE;
    this.rankingTimer = null;
    this.playingTimer = null;
  }

  update({ stateName, live, lastObject }) {
    // No state name means no information, keep the current status
    if (typeof stateName !== 'string') return;

    if (stateName !== ACTIVE_STATE) {
      this.clearTimers();
      this.setStatus(STATUS.IDLE);
      return;
    }

    const progress = getMapProgress(live, lastObject);
    if (progress === PROGRESS.UNKNOWN) return;

    if (progress === PROGRESS.RUNNING) {
      this.schedulePlaying();
      return;
    }

    // The map ended, so a pending switch to playing is no longer valid
    this.clearPlayingTimer();

    // Ranking is only reachable from playing, so a finished map seen on start stays idle
    if (this.status === STATUS.PLAYING) this.startRanking();
  }

  schedulePlaying() {
    if (this.status === STATUS.PLAYING || this.playingTimer) return;

    this.playingTimer = setTimeout(() => {
      this.playingTimer = null;
      // Only a confirmed playing state interrupts a ranking hold
      this.clearRankingTimer();
      this.setStatus(STATUS.PLAYING);
    }, PLAYING_DELAY_MS);
  }

  startRanking() {
    this.setStatus(STATUS.RANKING);
    this.rankingTimer = setTimeout(() => {
      this.rankingTimer = null;
      this.setStatus(STATUS.IDLE);
    }, RANKING_HOLD_MS);
  }

  clearRankingTimer() {
    if (!this.rankingTimer) return;
    clearTimeout(this.rankingTimer);
    this.rankingTimer = null;
  }

  clearPlayingTimer() {
    if (!this.playingTimer) return;
    clearTimeout(this.playingTimer);
    this.playingTimer = null;
  }

  clearTimers() {
    this.clearRankingTimer();
    this.clearPlayingTimer();
  }

  setStatus(next) {
    if (this.status === next) return;
    this.status = next;
    this.onChange(next);
  }

  stop() {
    this.clearTimers();
  }
}

export { StateMachine, STATUS };
