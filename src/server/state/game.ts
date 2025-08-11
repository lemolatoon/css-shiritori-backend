import type { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import type {
  ClientToServerEvents,
  Prompt,
  ServerToClientEvents,
  User,
} from "../../common/events";
import { logger } from "../services/logger";
import { getRandomPrompts } from "../services/prompts";
import { generateScreenshot } from "../services/screenshot";
import { type GameRoom, getPublicRoomState } from "./room";

const TURN_DURATION_SECONDS = 90;

export const startGame = (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: GameRoom,
): void => {
  room.gameState = "IN_GAME";
  room.turnNumber = 0;
  room.results = [];
  const users = Array.from(Object.values(room.users));
  const prompts = getRandomPrompts(users.length);

  room.results = prompts.map((p) => ({ initialPrompt: p, steps: [] }));

  users.forEach((user, index) => {
    const prompt = prompts[index];
    io.to(user.id).emit("gameStart", prompt);
    io.to(user.id).emit("updateRoomState", getPublicRoomState(room));
  });

  startTurn(io, room);
};

export const handleCssSubmission = async (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: GameRoom,
  user: User,
  css: string,
): Promise<void> => {
  if (room.gameState !== "IN_GAME" || room.submissions[user.id]) return;

  room.submissions[user.id] = css;

  // 全員が提出したらターンを即時終了
  if (Object.keys(room.submissions).length === Object.keys(room.users).length) {
    await endTurn(io, room);
  }
};

const startTurn = (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: GameRoom,
): void => {
  room.submissions = {};
  let remainingTime = TURN_DURATION_SECONDS;

  io.to(room.roomCode).emit("timerUpdate", remainingTime);

  room.timerId = setInterval(async () => {
    remainingTime--;
    io.to(room.roomCode).emit("timerUpdate", remainingTime);

    if (remainingTime <= 0) {
      if (room.timerId) clearInterval(room.timerId);
      await endTurn(io, room);
    }
  }, 1000);
};

const endTurn = async (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: GameRoom,
): Promise<void> => {
  if (room.timerId) {
    clearInterval(room.timerId);
    room.timerId = null;
  }
  logger.info(`Ending turn ${room.turnNumber} for room ${room.roomCode}`);

  // 現在のターンに対応する結果チェーンを見つける
  const currentChainIndex = room.turnNumber % room.results.length;
  const currentChain = room.results[currentChainIndex];

  const users = Array.from(Object.values(room.users));
  const submissionPromises = users.map(async (user) => {
    const css = room.submissions[user.id] || ""; // 未提出の場合は空CSS
    const html = currentChain.initialPrompt.html;
    const fileName: `${string}.png` = `${room.roomCode}-${uuidv4()}.png`;
    const resultImageUrl = await generateScreenshot(html, css, fileName);
    logger.info(
      `Generated result image for user ${user.name} (${user.id}): ${resultImageUrl}`,
    );
    currentChain.steps.push({
      author: user,
      submittedCss: css,
      resultImageUrl,
    });
  });

  await Promise.all(submissionPromises);
  logger.info(`currentChain.steps: ${JSON.stringify(currentChain.steps)}`);

  const totalTurns = Object.keys(room.users).length;
  if (room.turnNumber + 1 >= totalTurns) {
    // ゲーム終了
    room.gameState = "RESULTS";
    io.to(room.roomCode).emit("gameFinished", { chains: room.results });
    io.to(room.roomCode).emit("updateRoomState", getPublicRoomState(room));
  } else {
    // 次のターンへ
    room.turnNumber++;
    const nextUsers = Array.from(Object.values(room.users)); // 新しい順序かもしれない
    nextUsers.forEach((user) => {
      // 次のお題は、前のターンの結果から
      const previousStep = room.results[currentChainIndex].steps.find(
        (s) => s.author.id !== user.id,
      );
      logger.info(
        `Previous step for ${user.name} (${user.id}): ${JSON.stringify(previousStep)}`,
      );
      if (previousStep) {
        const nextPrompt: Prompt = {
          html: currentChain.initialPrompt.html,
          targetImageUrl: previousStep.resultImageUrl,
        };
        logger.info(
          `Sending new turn prompt to ${user.name} (${user.id}): ${JSON.stringify(nextPrompt)}`,
        );
        io.to(user.id).emit("newTurn", nextPrompt, room.turnNumber, totalTurns);
      }
    });
    startTurn(io, room);
  }
};

export const resetToLobby = (room: GameRoom) => {
  room.gameState = "LOBBY";
  room.turnNumber = 0;
  room.submissions = {};
  room.results = [];
  if (room.timerId) {
    clearInterval(room.timerId);
    room.timerId = null;
  }
};
