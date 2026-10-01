const STATUS = { IDLE: 'idle', PLAYING: 'playing', RANKING: 'ranking' };

// The only tosu state that counts as an active match
const ACTIVE_STATE = 'spectating';
const RANKING_HOLD_MS = 10000;

// Missing or invalid time data counts as a map still in progress
function isMapEnded(live, lastObject) {
  return Number.isFinite(live) && Number.isFinite(lastObject) && lastObject > 0 && live >= lastObject;
}

class StateMachine {
  constructor(onChange) {
    this.onChange = onChange;
    this.status = STATUS.IDLE;
    this.rankingTimer = null;
  }

  update({ stateName, live, lastObject }) {
    // No state name means no information, keep the current status
    if (typeof stateName !== 'string') return;

    if (stateName !== ACTIVE_STATE) {
      this.clearRankingTimer();
      this.setStatus(STATUS.IDLE);
      return;
    }

    if (!isMapEnded(live, lastObject)) {
      this.clearRankingTimer();
      this.setStatus(STATUS.PLAYING);
      return;
    }

    // Ranking is only reachable from playing, so a finished map seen on start stays idle
    if (this.status === STATUS.PLAYING) this.startRanking();
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

  setStatus(next) {
    if (this.status === next) return;
    this.status = next;
    this.onChange(next);
  }

  stop() {
    this.clearRankingTimer();
  }
}

export { StateMachine, STATUS };
