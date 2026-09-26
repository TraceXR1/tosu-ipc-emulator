import * as ipc from './src/ipc-writer.js';
import * as shutdown from './src/shutdown.js';
import * as tosu from './src/tosu-process.js';
import { WebSocketManager } from './src/websocket-manager.js';

const TOSU_HOST = '127.0.0.1:24050';

shutdown.installHandlers();
shutdown.registerCleanup(tosu.stop);
shutdown.registerCleanup(ipc.stop);

ipc.ensureFiles();
await tosu.start();

const socket = new WebSocketManager(TOSU_HOST);
shutdown.registerCleanup(() => socket.close());
socket.api_v2((data) => ipc.update(data));

// Keeps the process and the console window alive until a shutdown signal arrives
setInterval(() => {}, 1 << 30);
