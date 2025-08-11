import type {
  GameState,
  ResultChain,
  RoomState,
  User,
} from "../../common/events";
import { logger } from "../services/logger";
import { Lock } from "../utils/lock";

// サーバー内部で持つ部屋の状態
export interface GameRoom {
  roomCode: string;
  hostId: string;
  users: Record<string, User>;
  gameState: GameState;
  prompts: Record<string, string>; // userId -> prompt's original authorId
  turnNumber: number;
  submissions: Record<string, string>; // userId -> css
  results: ResultChain[];
  timerId: NodeJS.Timeout | null;
}

// 全ての部屋を管理するMap
const rooms = new Map<string, GameRoom>();
const roomLocks = new Map<string, Lock>();

const getRoomLock = (roomCode: string): Lock => {
  if (!roomLocks.has(roomCode)) {
    roomLocks.set(roomCode, new Lock());
  }
  const lock = roomLocks.get(roomCode);
  if (!lock) {
    throw new Error(`Lock for room ${roomCode} not found`);
  }
  return lock;
};

export const createRoom = (
  roomCode: string,
  hostId: string,
  hostName: string,
): GameRoom => {
  const hostUser: User = { id: hostId, name: hostName };
  const newRoom: GameRoom = {
    roomCode,
    hostId,
    users: { [hostId]: hostUser },
    gameState: "LOBBY",
    prompts: {},
    turnNumber: 0,
    submissions: {},
    results: [],
    timerId: null,
  };
  rooms.set(roomCode, newRoom);
  return newRoom;
};

export const getRoom = (roomCode: string): GameRoom | undefined => {
  return rooms.get(roomCode);
};

export const getRoomByUserId = (userId: string): GameRoom | undefined => {
  for (const room of rooms.values()) {
    if (room.users[userId]) {
      return room;
    }
  }
  return undefined;
};

export const addUserToRoom = async (
  roomCode: string,
  user: User,
): Promise<void> => {
  const lock = getRoomLock(roomCode);
  await lock.acquire();
  try {
    const room = getRoom(roomCode);
    if (room) {
      room.users[user.id] = user;
      logger.info(
        `User ${user.name} (${user.id}) added to room: ${roomCode}, total users: ${Object.keys(room.users).length}`,
      );
    }
  } finally {
    lock.release();
  }
};

export const removeUserFromRoom = async (
  userId: string,
): Promise<{ room: GameRoom; wasHost: boolean } | null> => {
  const room = getRoomByUserId(userId);
  if (!room) return null;

  const lock = getRoomLock(room.roomCode);
  await lock.acquire();
  try {
    delete room.users[userId];
    if (Object.keys(room.users).length === 0) {
      if (room.timerId) clearTimeout(room.timerId);
      rooms.delete(room.roomCode);
      return null; // 部屋が空になったので削除
    }

    const wasHost = room.hostId === userId;
    if (wasHost) {
      // 新しいホストを任命
      room.hostId = Object.keys(room.users)[0];
    }
    return { room, wasHost };
  } finally {
    lock.release();
  }
};

// 外部に渡す用の安全なRoomStateオブジェクトを生成
export const getPublicRoomState = (room: GameRoom): RoomState => {
  return {
    roomCode: room.roomCode,
    users: Object.values(room.users),
    hostId: room.hostId,
    gameState: room.gameState,
  };
};

export const TEST_ONLY = {
  reset: (): void => {
    rooms.clear();
  },
};
