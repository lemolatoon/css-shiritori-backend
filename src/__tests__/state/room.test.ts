import type { User } from "../../common/events";
import {
  addUserToRoom,
  createRoom,
  getRoom,
  getRoomByUserId,
  removeUserFromRoom,
  TEST_ONLY,
} from "../../server/state/room";

describe("Room State Management", () => {
  beforeEach(() => {
    // 各テストの前に状態をリセット
    TEST_ONLY.reset();
  });

  const test1 = "should create a new room correctly";
  test(test1, () => {
    const room = createRoom(test1, "host-id", "Host");
    expect(room.roomCode).toBe(test1);
    expect(room.hostId).toBe("host-id");
    expect(Object.keys(room.users).length).toBe(1);
    expect(room.users["host-id"]).toEqual({ id: "host-id", name: "Host" });
    expect(getRoom(test1)).toBe(room);
  });

  const test2 = "should add a user to an existing room";
  test(test2, async () => {
    await createRoom(test2, "host-id", "Host");
    const newUser: User = { id: "user-2", name: "Player2" };
    await addUserToRoom(test2, newUser);

    const room = getRoom(test2);
    expect(room).toBeDefined();
    if (!room) fail("Room should be defined");
    expect(Object.keys(room.users).length).toBe(2);
    expect(room.users["user-2"]).toEqual(newUser);
  });

  const test3 = "should find a room by user ID";
  test(test3, async () => {
    createRoom(test3, "host-a", "HostA");
    const userB: User = { id: "user-b", name: "PlayerB" };
    await addUserToRoom(test3, userB);

    const foundRoom = getRoomByUserId("user-b");
    expect(foundRoom).toBeDefined();
    expect(foundRoom?.roomCode).toBe(test3);
  });

  const test4 = "should remove a user from a room";
  test(test4, () => {
    createRoom(test4, "host-id", "Host");
    addUserToRoom(test4, { id: "user-2", name: "Player2" });
    removeUserFromRoom("user-2");

    const room = getRoom(test4);
    expect(room).toBeDefined();
    if (!room) fail("Room should be defined");
    expect(Object.keys(room.users).length).toBe(1);
    expect(room.users["user-2"]).toBeUndefined();
  });

  const test5 = "should reassign host if the host leaves";
  test(test5, async () => {
    createRoom(test5, "host-id", "Host");
    await addUserToRoom(test5, { id: "user-2", name: "Player2" });
    await removeUserFromRoom("host-id");

    const room = getRoom(test5);
    if (!room) fail("Room should be defined");
    expect(room.hostId).toBe("user-2");
  });

  const test6 = "should not reassign host if the last user leaves";
  test(test6, async () => {
    createRoom(test6, "host-id", "Host");
    await removeUserFromRoom("host-id");
    expect(getRoom(test6)).toBeUndefined();
  });
});
