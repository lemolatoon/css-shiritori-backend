import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { ClientToServerEvents, ServerToClientEvents, User, Prompt, ResultChain } from '../../common/events';
import { generateScreenshot } from '../services/screenshot';
import { getRandomPrompts } from '../services/prompts';
import { GameRoom, getPublicRoomState } from './room';
import { logger } from '../services/logger';

const TURN_DURATION_SECONDS = 90;

export const startGame = (io: Server<ClientToServerEvents, ServerToClientEvents>, room: GameRoom): void => {
  room.gameState = 'IN_GAME';
  room.turnNumber = 1;
  room.results = [];
  const users = Array.from(room.users.values());
  const prompts = getRandomPrompts(users.length);

  room.results = prompts.map(p => ({ initialPrompt: p, steps: [] }));

  users.forEach((user, index) => {
    const prompt = prompts[index];
    io.to(user.id).emit('gameStart', prompt);
  });

  io.to(room.roomCode).emit('updateRoomState', getPublicRoomState(room));
  startTurn(io, room);
};

export const handleCssSubmission = async (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: GameRoom,
  user: User,
  css: string
): Promise<void> => {
  if (room.gameState !== 'IN_GAME' || room.submissions.has(user.id)) return;
  
  room.submissions.set(user.id, css);

  // 全員が提出したらターンを即時終了
  if (room.submissions.size === room.users.size) {
    await endTurn(io, room);
  }
};

const startTurn = (io: Server<ClientToServerEvents, ServerToClientEvents>, room: GameRoom): void => {
  room.submissions.clear();
  let remainingTime = TURN_DURATION_SECONDS;

  io.to(room.roomCode).emit('timerUpdate', remainingTime);

  room.timerId = setInterval(async () => {
    remainingTime--;
    io.to(room.roomCode).emit('timerUpdate', remainingTime);

    if (remainingTime <= 0) {
      if(room.timerId) clearInterval(room.timerId);
      await endTurn(io, room);
    }
  }, 1000);
};

const endTurn = async (io: Server<ClientToServerEvents, ServerToClientEvents>, room: GameRoom): Promise<void> => {
    if (room.timerId) {
        clearInterval(room.timerId);
        room.timerId = null;
    }
    logger.info(`Ending turn ${room.turnNumber} for room ${room.roomCode}`);

    // 現在のターンに対応する結果チェーンを見つける
    const currentChainIndex = (room.turnNumber - 1) % room.results.length;
    const currentChain = room.results[currentChainIndex];
    
    const users = Array.from(room.users.values());
    const submissionPromises = users.map(async (user) => {
        const css = room.submissions.get(user.id) || ''; // 未提出の場合は空CSS
        const html = currentChain.initialPrompt.html;
        const fileName: `${string}.png` = `${room.roomCode}-${uuidv4()}.png`;
        const resultImageUrl = await generateScreenshot(html, css, fileName);
        currentChain.steps.push({
            author: user,
            submittedCss: css,
            resultImageUrl,
        });
    });

    await Promise.all(submissionPromises);

    const totalTurns = room.users.size;
    if (room.turnNumber >= totalTurns) {
        // ゲーム終了
        room.gameState = 'RESULTS';
        io.to(room.roomCode).emit('gameFinished', { chains: room.results });
        io.to(room.roomCode).emit('updateRoomState', getPublicRoomState(room));
    } else {
        // 次のターンへ
        room.turnNumber++;
        const nextUsers = Array.from(room.users.values()); // 新しい順序かもしれない
        nextUsers.forEach((user) => {
            // 次のお題は、前のターンの結果から
            const previousStep = room.results[currentChainIndex].steps.find(s => s.author.id !== user.id);
            if (previousStep) {
                const nextPrompt: Prompt = {
                    html: currentChain.initialPrompt.html,
                    targetImageUrl: previousStep.resultImageUrl,
                };
                io.to(user.id).emit('newTurn', nextPrompt, room.turnNumber, totalTurns);
            }
        });
        startTurn(io, room);
    }
};

export const resetToLobby = (room: GameRoom) => {
    room.gameState = 'LOBBY';
    room.turnNumber = 0;
    room.submissions.clear();
    room.results = [];
    if(room.timerId) {
        clearInterval(room.timerId);
        room.timerId = null;
    }
}