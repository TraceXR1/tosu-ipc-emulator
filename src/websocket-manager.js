import * as logger from './logger.js';

const RECONNECT_DELAY_MS = 1000;

class WebSocketManager {
  constructor(host) {
    this.host = host;
    this.ws = null;
    this.reconnectTimer = null;
    this.closed = false;
  }

  api_v2(callback) {
    this.connect('/websocket/v2', callback);
  }

  connect(path, callback) {
    if (this.closed) return;

    const ws = new WebSocket(`ws://${this.host}${path}`);
    this.ws = ws;

    ws.addEventListener('open', () => logger.log('Connected to tosu'));
    ws.addEventListener('message', (event) => this.handleMessage(event, callback));
    ws.addEventListener('close', () => this.handleClose(path, callback));
    // The close event follows every error and drives the reconnect, nothing to do here
    ws.addEventListener('error', () => {});
  }

  handleMessage(event, callback) {
    logger.debug(`tosu data: ${event.data}`);

    try {
      callback(JSON.parse(event.data));
    } catch (error) {
      logger.warn(`Failed to parse a tosu message: ${error.message}`);
    }
  }

  handleClose(path, callback) {
    this.ws = null;
    if (this.closed) return;

    logger.warn('Lost connection to tosu, retrying...');
    this.reconnectTimer = setTimeout(() => this.connect(path, callback), RECONNECT_DELAY_MS);
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}

export { WebSocketManager };
