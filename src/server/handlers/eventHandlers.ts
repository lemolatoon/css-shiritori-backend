import { Server, Socket } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from '../../common/events';
import { logger } from '../services/logger';
import {
  createRoom, getRoom, addUserToRoom, removeUserFromRoom, getPublicRoomState, getRoomByUserId
} from '../state/room';
import { startGame, handleCssSubmission, resetToLobby } from '../state/game';

let resultStep = { chainIndex: 0, stepIndex: -1 };

export const registerEventHandlers = (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
): void => {

  logger.info(`User connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomCode, name }, ack) => {
    let room = getRoom(roomCode);
    if (!room) {
      room = createRoom(roomCode, socket.id, name);
      logger.info(`Room created: ${roomCode} by ${name}`);
    } else {
      addUserToRoom(roomCode, { id: socket.id, name });
    }
    
    socket.join(roomCode);
    ack({ success: true, roomState: getPublicRoomState(room) });
    io.to(roomCode).emit('updateRoomState', getPublicRoomState(room));
  });

  socket.on('startGame', () => {
    const room = getRoomByUserId(socket.id);
    if (room && room.hostId === socket.id && room.users.size >= 2) {
      logger.info(`Game started in room: ${room.roomCode}`);
      startGame(io, room);
    }
  });

  socket.on('submitCss', ({ css }, ack) => {
    const room = getRoomByUserId(socket.id);
    const user = room?.users.get(socket.id);
    if (room && user) {
        handleCssSubmission(io, room, user, css)
            .then(() => ack({ success: true, message: 'Submission received.' }))
            .catch(err => {
                logger.error('CSS submission failed:', err);
                ack({ success: false, message: 'Failed to process submission.' });
            });
    } else {
        ack({ success: false, message: 'Invalid session.' });
    }
  });

  socket.on('nextResultStep', () => {
    const room = getRoomByUserId(socket.id);
    if (!room || room.hostId !== socket.id || room.gameState !== 'RESULTS') return;

    if (resultStep.stepIndex < room.results[resultStep.chainIndex].steps.length - 1) {
        resultStep.stepIndex++;
    } else {
        if (resultStep.chainIndex < room.results.length - 1) {
            resultStep.chainIndex++;
            resultStep.stepIndex = 0;
        } else {
            // 全て表示完了
            return;
        }
    }
    io.to(room.roomCode).emit('showNextResult', resultStep);
  });

  socket.on('returnToLobby', () => {
    const room = getRoomByUserId(socket.id);
    if (room && room.hostId === socket.id) {
        resetToLobby(room);
        resultStep = { chainIndex: 0, stepIndex: -1 }; // Reset for next game
        io.to(room.roomCode).emit('lobbyReset');
        io.to(room.roomCode).emit('updateRoomState', getPublicRoomState(room));
    }
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
    const result = removeUserFromRoom(socket.id);
    if (result) {
      io.to(result.room.roomCode).emit('updateRoomState', getPublicRoomState(result.room));
    }
  });
};