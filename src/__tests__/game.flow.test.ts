// モックを有効にする
jest.mock("../server/services/screenshot.ts");
jest.mock("../server/services/prompts.ts", () => ({
  ...jest.requireActual("../server/services/prompts.ts"),
  getRandomPrompts: jest.fn().mockReturnValue([
    { html: "<div></div>", targetImageUrl: "/prompts/mock-1/target.png" },
    { html: "<span></span>", targetImageUrl: "/prompts/mock-2/target.png" },
  ]),
}));

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, type Socket as ServerSocket } from "socket.io";
import { type Socket as ClientSocket, io } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameResults,
  Prompt,
  RoomState,
  ServerToClientEvents,
} from "../common/events";
import { registerEventHandlers } from "../server/handlers/eventHandlers";
import { logger } from "../server/services/logger";
import {
  getPublicRoomState,
  getRoom,
  TEST_ONLY as room_TEST_ONLY,
} from "../server/state/room";

describe("CSS Shiritori Game Flow", () => {
  let ioServer: Server<ClientToServerEvents, ServerToClientEvents>;
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let hostClient: ClientSocket<ServerToClientEvents, ClientToServerEvents>;
  let player2Client: ClientSocket<ServerToClientEvents, ClientToServerEvents>;

  // 非同期のackを待つためのヘルパー関数
  const waitForAck = <T>(
    socket: ClientSocket,
    event: keyof ClientToServerEvents,
    ...args: unknown[]
  ): Promise<T> => {
    return new Promise((resolve) => {
      socket.emit(event, ...args, (response: T) => {
        resolve(response);
      });
    });
  };

  // サーバーからの特定のイベントを待つヘルパー関数
  const waitForEvent = <T>(
    socket: ClientSocket,
    event: keyof ServerToClientEvents,
  ): Promise<T> => {
    return new Promise((resolve) => {
      socket.once(event, (...data: unknown[]) => {
        logger.info(`Received event '${event.toString()}':`, data);
        if (data.length === 1) {
          resolve(data[0] as T);
        } else {
          resolve(data as T);
        }
      });
    });
  };

  beforeAll((done) => {
    httpServer = createServer();
    ioServer = new Server(httpServer);
    ioServer.on(
      "connection",
      (socket: ServerSocket<ClientToServerEvents, ServerToClientEvents>) => {
        registerEventHandlers(ioServer, socket);
      },
    );
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  beforeEach((done) => {
    // 各テストの前に状態をリセット
    room_TEST_ONLY.reset();

    // クライアントを接続
    const clientOptions = { reconnection: false, forceNew: true };
    hostClient = io(`http://localhost:${port}`, clientOptions);
    player2Client = io(`http://localhost:${port}`, clientOptions);

    let connectedCount = 0;
    const onConnect = () => {
      connectedCount++;
      if (connectedCount === 2) done();
    };
    hostClient.on("connect", onConnect);
    player2Client.on("connect", onConnect);
  });

  afterEach(() => {
    hostClient.disconnect();
    player2Client.disconnect();
  });

  afterAll(() => {
    ioServer.close();
    httpServer.close();
  });

  const test1 = "Full Game Flow: Join -> Start -> Play -> Results -> Lobby";
  test(test1, async () => {
    const ROOM_CODE = test1;

    // 1. Room Setup
    const hostAck = await waitForAck<{
      success: boolean;
      roomState: RoomState;
    }>(hostClient, "joinRoom", { roomCode: ROOM_CODE, name: "Host" });
    expect(hostAck.success).toBe(true);
    const p2Ack = await waitForAck<{ success: boolean; roomState: RoomState }>(
      player2Client,
      "joinRoom",
      { roomCode: ROOM_CODE, name: "Player2" },
    );
    expect(p2Ack.success).toBe(true);

    const room = getRoom(ROOM_CODE);
    if (!room) fail("Room should be defined");
    const roomState = getPublicRoomState(room);
    expect(roomState.users.length).toBe(2);
    expect(roomState.gameState).toBe("LOBBY");

    const gameStartPromises = [
      waitForEvent<Prompt>(hostClient, "gameStart"),
      waitForEvent<Prompt>(player2Client, "gameStart"),
    ] as const;

    const gameStartAck = await waitForAck<{
      success: boolean;
      roomState: RoomState | undefined;
    }>(hostClient, "startGame");
    expect(gameStartAck.success).toBe(true);
    expect(gameStartAck.roomState?.gameState).toBe("IN_GAME");

    // 2. Game Start
    const [hostPrompt, p2Prompt] = await Promise.all(gameStartPromises);

    expect(hostPrompt).toBeDefined();
    expect(p2Prompt).toBeDefined();

    // 3. Gameplay Loop (1st Turn)
    const turnEnd = waitForEvent<[Prompt, number, number]>(
      hostClient,
      "newTurn",
    ); // ターン終了を待つ

    const hostSubmitAck = await waitForAck<{ success: boolean }>(
      hostClient,
      "submitCss",
      {
        css: "div { color: red; }",
      },
    );
    const p2SubmitAck = await waitForAck<{ success: boolean }>(
      player2Client,
      "submitCss",
      {
        css: "span { color: blue; }",
      },
    );
    expect(hostSubmitAck.success).toBe(true);
    expect(p2SubmitAck.success).toBe(true);

    const turnEndResolved = await turnEnd;
    const [nextPrompt, turnNumber, _totalTurns] = turnEndResolved;
    expect(nextPrompt).toBeDefined();
    expect(turnNumber).toBe(1);

    // 4. Gameplay Loop (2nd Turn - Final)
    const gameFinishedPromise = waitForEvent<GameResults>(
      hostClient,
      "gameFinished",
    );

    await Promise.all([
      waitForAck(hostClient, "submitCss", { css: "div { background: #eee; }" }),
      waitForAck(player2Client, "submitCss", {
        css: "span { font-size: 20px; }",
      }),
    ]);

    const finalResults = await gameFinishedPromise;
    expect(finalResults.chains.length).toBe(2);
    expect(finalResults.chains[0].steps.length).toBe(2);

    // 5. Results Phase
    const showResultPromise = waitForEvent(hostClient, "showNextResult");
    hostClient.emit("nextResultStep"); // ホストが「次へ」を押す
    const resultStep = await showResultPromise;
    expect(resultStep).toEqual({ chainIndex: 0, stepIndex: 0 });

    // 6. Return to Lobby
    const lobbyResetPromise = waitForEvent(hostClient, "lobbyReset");
    const finalRoomStatePromise = waitForEvent<RoomState>(
      hostClient,
      "updateRoomState",
    );
    hostClient.emit("returnToLobby");

    await lobbyResetPromise;
    const finalRoomState = await finalRoomStatePromise;
    expect(finalRoomState.gameState).toBe("LOBBY");
  });
});
