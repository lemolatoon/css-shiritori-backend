import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../common/events";
import { registerEventHandlers } from "./handlers/eventHandlers";
import { logger } from "./services/logger";
import { loadInitialPrompts } from "./services/prompts";
import { initScreenshotService } from "./services/screenshot";

const PORT = process.env.PORT || 4000;

const app = express();
const httpServer = http.createServer(app);

// 型定義を適用したSocket.IOサーバーインスタンス
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "*", // 本番環境ではクライアントのURLに限定してください
    methods: ["GET", "POST"],
  },
});

// 静的ファイルの配信
app.use("/prompts", express.static(path.join(process.cwd(), "prompts")));
app.use(
  "/results",
  express.static(path.join(process.cwd(), "public", "results")),
);

io.on("connection", (socket) => {
  registerEventHandlers(io, socket);
});

export const startServer = async () => {
  await loadInitialPrompts();
  await initScreenshotService();

  httpServer.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
  });
};
