import { User, RoomState, GameState, ResultChain } from '../../common/events';

// サーバー内部で持つ部屋の状態
export interface GameRoom {
  roomCode: string;
  hostId: string;
  users: Map<string, User>;
  gameState: GameState;
  prompts: Map<string, string>; // userId -> prompt's original authorId
  turnNumber: number;
  submissions: Map<string, string>; // userId -> css
  results: ResultChain[];
  timerId: NodeJS.Timeout | null;
}

// 全ての部屋を管理するMap
const rooms = new Map<string, GameRoom>();

export const createRoom = (roomCode: string, hostId: string, hostName: string): GameRoom => {
  const hostUser: User = { id: hostId, name: hostName };
  const newRoom: GameRoom = {
    roomCode,
    hostId,
    users: new Map([[hostId, hostUser]]),
    gameState: 'LOBBY',
    prompts: new Map(),
    turnNumber: 0,
    submissions: new Map(),
    results: [],
    timerId: null
  };
  rooms.set(roomCode, newRoom);
  return newRoom;
};

export const getRoom = (roomCode: string): GameRoom | undefined => {
  return rooms.get(roomCode);
};

export const getRoomByUserId = (userId: string): GameRoom | undefined => {
    for (const room of rooms.values()) {
        if (room.users.has(userId)) {
            return room;
        }
    }
    return undefined;
};

export const addUserToRoom = (roomCode: string, user: User): void => {
  const room = getRoom(roomCode);
  if (room) {
    room.users.set(user.id, user);
  }
};

export const removeUserFromRoom = (userId: string): { room: GameRoom, wasHost: boolean } | null => {
  const room = getRoomByUserId(userId);
  if (!room) return null;

  room.users.delete(userId);
  if (room.users.size === 0) {
    if(room.timerId) clearTimeout(room.timerId);
    rooms.delete(room.roomCode);
    return null; // 部屋が空になったので削除
  }
  
  const wasHost = room.hostId === userId;
  if (wasHost) {
    // 新しいホストを任命
    room.hostId = room.users.keys().next().value;
  }
  return { room, wasHost };
};

// 外部に渡す用の安全なRoomStateオブジェクトを生成
export const getPublicRoomState = (room: GameRoom): RoomState => {
  return {
    roomCode: room.roomCode,
    users: Array.from(room.users.values()),
    hostId: room.hostId,
    gameState: room.gameState,
  };
};