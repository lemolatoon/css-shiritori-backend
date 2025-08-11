import type { Server } from "socket.io";
import * as path from "node:path";
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

const shuffle = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const startGame = (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: GameRoom,
): void => {
  room.gameState = "IN_GAME";
  room.turnNumber = 0;
  room.results = [];
  room.assignments = [];

  const userIds = Object.keys(room.users);
  const prompts = getRandomPrompts(userIds.length);

  // 1. 結果の器を作成
  room.results = prompts.map((p) => ({ initialPrompt: p, steps: [] }));

  // 2. 割り当て表を作成
  // まず、ユーザーリストを一度だけシャッフルして、最初のターンの割り当てを決定します。
  const baseAssignees = shuffle(userIds);

  // ターンごとに割り当てを作成していきます。
  const assignmentsByTurn: string[][] = [];
  for (let i = 0; i < userIds.length; i++) {
    // 毎ターン、リストを1つずつローテーションさせることで、担当者が重複しないようにします。
    // 例: [A, B, C] -> [B, C, A] -> [C, A, B]
    const rotatedAssignees = [...baseAssignees.slice(i), ...baseAssignees.slice(0, i)];
    assignmentsByTurn.push(rotatedAssignees);
  }

  // 現在の`assignmentsByTurn`は「ターンごとの担当者リスト」になっています。
  // これを「お題ごとの担当者リスト」に変換（行列の転置）します。
  room.assignments = assignmentsByTurn[0].map((_, colIndex) => 
    assignmentsByTurn.map(row => row[colIndex])
  );

  logger.info(JSON.stringify(room.assignments), "Game assignments created");

  // 3. 最初のお題を配布
  room.assignments.forEach((assignedUserIds, chainIndex) => {
    const firstUserId = assignedUserIds[0];
    const prompt = prompts[chainIndex];
    io.to(firstUserId).emit("gameStart", prompt);
  });

  io.to(room.roomCode).emit("updateRoomState", getPublicRoomState(room));
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
  logger.info(JSON.stringify({ submission: { userId: user.id, cssLength: css.length } }), "CSS submission received");

  // 全員が提出したらターンを即時終了
  if (Object.keys(room.submissions).length === Object.keys(room.users).length) {
    if (room.timerId) {
      clearInterval(room.timerId);
      room.timerId = null;
    }
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

  const currentTurnIndex = room.turnNumber;
  const numUsers = Object.keys(room.users).length;

  // 現在のターンの結果を処理
  const submissionPromises = room.assignments.map(async (assignedUserIds, chainIndex) => {
    const userId = assignedUserIds[currentTurnIndex];
    const user = room.users[userId];
    if (!user) return; // ユーザーが途中で抜けた場合など

    const css = room.submissions[userId] || ""; // 未提出は空CSS
    const html = room.results[chainIndex].initialPrompt.html;
    
    const fileName: `${string}.png` = `${room.roomCode}-${uuidv4()}.png`;
    const fullOutputPath = path.join(process.cwd(), "public", "results", fileName) as `${string}.png`;
    const resultImageUrl = await generateScreenshot(html, css, fullOutputPath);

    room.results[chainIndex].steps.push({
      author: user,
      submittedCss: css,
      resultImageUrl,
    });
  });

  await Promise.all(submissionPromises);
  logger.info(`All submissions for turn ${currentTurnIndex} processed.`);

  // 次のターンに進むか、ゲームを終了するか
  const nextTurnIndex = currentTurnIndex + 1;
  if (nextTurnIndex >= numUsers) {
    // ゲーム終了
    room.gameState = "RESULTS";
    io.to(room.roomCode).emit("gameFinished", { chains: room.results });
    io.to(room.roomCode).emit("updateRoomState", getPublicRoomState(room));
    logger.info(`Game finished for room ${room.roomCode}`);
  } else {
    // 次のターンへ
    room.turnNumber = nextTurnIndex;

    // 次のお題を配布
    room.assignments.forEach((assignedUserIds, chainIndex) => {
      const nextUserId = assignedUserIds[nextTurnIndex];
      const previousStep = room.results[chainIndex].steps[currentTurnIndex];

      const nextPrompt: Prompt = {
        html: room.results[chainIndex].initialPrompt.html,
        targetImageUrl: previousStep.resultImageUrl,
      };
      io.to(nextUserId).emit("newTurn", nextPrompt, room.turnNumber, numUsers);
    });
    
    logger.info(`Starting turn ${nextTurnIndex} for room ${room.roomCode}`);
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
