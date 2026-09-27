import crypto from 'node:crypto';
import net from 'node:net';

// RFC 6455 handshake magic value
const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODE = { CONTINUATION: 0x0, TEXT: 0x1, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

// A minimal client: connects, performs the HTTP Upgrade handshake, and parses
// incoming frames. Exposes the same addEventListener/close shape as the
// browser WebSocket, just enough for websocket-manager.js to stay unchanged.
class RawWebSocket {
  constructor(url) {
    const { hostname, port, pathname } = new URL(url);
    this.hostname = hostname;
    this.port = Number(port) || 80;
    this.path = pathname || '/';

    this.listeners = { open: [], message: [], close: [], error: [] };
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.handshakeDone = false;
    this.closing = false;
    this.closed = false;

    this.connect();
  }

  addEventListener(type, handler) {
    this.listeners[type].push(handler);
  }

  emit(type, arg) {
    for (const handler of this.listeners[type]) handler(arg);
  }

  connect() {
    const key = crypto.randomBytes(16).toString('base64');
    this.expectedAccept = crypto.createHash('sha1').update(key + HANDSHAKE_GUID).digest('base64');

    this.socket = net.createConnection({ host: this.hostname, port: this.port });
    this.socket.on('connect', () => this.sendHandshake(key));
    this.socket.on('data', (chunk) => this.onData(chunk));
    this.socket.on('error', (error) => this.emit('error', error));
    this.socket.on('close', () => this.onSocketClose());
  }

  sendHandshake(key) {
    const request =
      `GET ${this.path} HTTP/1.1\r\n` +
      `Host: ${this.hostname}:${this.port}\r\n` +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Key: ${key}\r\n` +
      'Sec-WebSocket-Version: 13\r\n\r\n';
    this.socket.write(request);
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshakeDone && !this.consumeHandshakeResponse()) return;
    this.parseFrames();
  }

  // Returns true once the handshake has been read (or failed), false while still waiting for more data
  consumeHandshakeResponse() {
    const headerEnd = this.buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return false;

    const header = this.buffer.subarray(0, headerEnd).toString('latin1');
    this.buffer = this.buffer.subarray(headerEnd + 4);

    const [statusLine, ...headerLines] = header.split('\r\n');
    if (!/^HTTP\/1\.1 101\b/.test(statusLine)) {
      this.fail(new Error(`Unexpected handshake response: ${statusLine}`));
      return false;
    }

    const acceptLine = headerLines.find((line) => line.toLowerCase().startsWith('sec-websocket-accept:'));
    const accept = acceptLine ? acceptLine.split(':')[1].trim() : null;
    if (accept !== this.expectedAccept) {
      this.fail(new Error('Sec-WebSocket-Accept did not match'));
      return false;
    }

    this.handshakeDone = true;
    this.emit('open');
    return true;
  }

  fail(error) {
    this.emit('error', error);
    this.socket.destroy();
  }

  parseFrames() {
    for (;;) {
      if (this.buffer.length < 2) return;

      const byte0 = this.buffer[0];
      const byte1 = this.buffer[1];
      const fin = (byte0 & 0x80) !== 0;
      const opcode = byte0 & 0x0f;
      const masked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < offset + 2) return;
        payloadLen = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (this.buffer.length < offset + 8) return;
        payloadLen = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let maskKey = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLen) return;

      let payload = this.buffer.subarray(offset, offset + payloadLen);
      if (masked) {
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
      }

      this.buffer = this.buffer.subarray(offset + payloadLen);
      this.handleFrame(fin, opcode, payload);
    }
  }

  handleFrame(fin, opcode, payload) {
    switch (opcode) {
      case OPCODE.TEXT:
      case OPCODE.CONTINUATION:
        this.fragments.push(payload);
        if (fin) {
          const message = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.emit('message', { data: message });
        }
        break;
      case OPCODE.CLOSE:
        // Only echo the close frame if we didn't already initiate closing ourselves
        if (!this.closing) this.sendFrame(OPCODE.CLOSE, payload);
        this.socket.end();
        this.reportClose(payload.length >= 2 ? payload.readUInt16BE(0) : 1005);
        break;
      case OPCODE.PING:
        this.sendFrame(OPCODE.PONG, payload);
        break;
      case OPCODE.PONG:
        break;
    }
  }

  onSocketClose() {
    this.reportClose(1006);
  }

  reportClose(code) {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', { code });
  }

  sendFrame(opcode, payload = Buffer.alloc(0)) {
    // RFC 6455 requires every client-to-server frame to be masked
    const maskKey = crypto.randomBytes(4);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= maskKey[i % 4];

    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }

    this.socket.write(Buffer.concat([header, maskKey, masked]));
  }

  close() {
    if (this.closing) {
      this.socket.destroy();
      return;
    }
    this.closing = true;
    try {
      this.sendFrame(OPCODE.CLOSE);
    } catch {
      // socket may already be gone, end() below still cleans up
    }
    this.socket.end();
  }
}

export { RawWebSocket };
