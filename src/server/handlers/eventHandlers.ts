import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../common/events";
import { logger } from "../services/logger";
import { handleCssSubmission, resetToLobby, startGame } from "../state/game";
import {
  addUserToRoom,
  createRoom,
  getPublicRoomState,
  getRoom,
  getRoomByUserId,
  removeUserFromRoom,
} from "../state/room";

let resultStep = { chainIndex: 0, stepIndex: -1 };

export const registerEventHandlers = (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
): void => {
  logger.info(`User connected: ${socket.id}`);

  socket.on("joinRoom", async ({ roomCode, name }, ack) => {
    logger.info(`User ${name} (${socket.id}) joining room: ${roomCode}`);
    let room = getRoom(roomCode);
    if (!room) {
      room = createRoom(roomCode, socket.id, name);
      logger.info(`Room created: ${roomCode} by ${name}`);
    } else {
      await addUserToRoom(roomCode, { id: socket.id, name });
    }

    await socket.join(roomCode);
    logger.info(
      `Users in Socket.IO's room(${roomCode}): ${Array.from(io.sockets.adapter.rooms.get(roomCode) ?? [])}`,
    );
    ack({ success: true, roomState: getPublicRoomState(room) });
    io.to(roomCode).emit("updateRoomState", getPublicRoomState(room));
  });

  socket.on("startGame", (ack) => {
    const room = getRoomByUserId(socket.id);
    logger.info(
      `User ${socket.id} requesting game start in room: ${room?.roomCode}`,
    );
    if (
      room &&
      room.hostId === socket.id &&
      Object.keys(room.users).length >= 2
    ) {
      logger.info(`Game started in room: ${room.roomCode}`);
      startGame(io, room);
      ack({ success: true, roomState: getPublicRoomState(room) });
    } else {
      ack({ success: false, roomState: undefined });
    }
  });

  socket.on("submitCss", ({ css }, ack) => {
    const room = getRoomByUserId(socket.id);
    const user = room?.users[socket.id];
    if (room && user) {
      handleCssSubmission(io, room, user, css)
        .then(() => ack({ success: true, message: "Submission received." }))
        .catch((err) => {
          logger.error("CSS submission failed:", err);
          ack({ success: false, message: "Failed to process submission." });
        });
    } else {
      ack({ success: false, message: "Invalid session." });
    }
  });

  socket.on("nextResultStep", () => {
    const room = getRoomByUserId(socket.id);
    if (!room || room.hostId !== socket.id || room.gameState !== "RESULTS")
      return;

    if (
      resultStep.stepIndex <
      room.results[resultStep.chainIndex].steps.length - 1
    ) {
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
    io.to(room.roomCode).emit("showNextResult", resultStep);
  });

  socket.on("returnToLobby", () => {
    const room = getRoomByUserId(socket.id);
    if (room && room.hostId === socket.id) {
      resetToLobby(room);
      resultStep = { chainIndex: 0, stepIndex: -1 }; // Reset for next game
      io.to(room.roomCode).emit("lobbyReset");
      io.to(room.roomCode).emit("updateRoomState", getPublicRoomState(room));
    }
  });

  socket.on("disconnect", async () => {
    logger.info(`User disconnected: ${socket.id}`);
    const result = await removeUserFromRoom(socket.id);
    if (result) {
      io.to(result.room.roomCode).emit(
        "updateRoomState",
        getPublicRoomState(result.room),
      );
    }
  });
};
