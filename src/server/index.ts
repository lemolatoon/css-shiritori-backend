import http from 'http';
import express from 'express';
import path from 'path';
import { Server } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from '../common/events';
import { logger } from './services/logger';
import { loadInitialPrompts } from './services/prompts';
import { initScreenshotService } from './services/screenshot';
import { registerEventHandlers } from './handlers/eventHandlers';

const PORT = process.env.PORT || 4000;

const app = express();
const httpServer = http.createServer(app);

// 型定義を適用したSocket.IOサーバーインスタンス
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "*", // 本番環境ではクライアントのURLに限定してください
    methods: ["GET", "POST"]
  }
});

// 静的ファイルの配信
app.use('/prompts', express.static(path.join(process.cwd(), 'prompts')));
app.use('/results', express.static(path.join(process.cwd(), 'public', 'results')));

io.on('connection', (socket) => {
  registerEventHandlers(io, socket);
});

export const startServer = async () => {
  await loadInitialPrompts();
  await initScreenshotService();

  httpServer.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
  });
};
