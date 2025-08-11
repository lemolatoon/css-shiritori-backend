import { z } from "zod";

// ====================================================================================
//  1. Zod スキーマと TypeScript 型定義
// アプリケーションで送受信されるデータの構造をここで一元管理します。
// Zodスキーマが「信頼できる唯一の情報源(Single Source of Truth)」となります。
// ====================================================================================

/**
 * ユーザー情報を表すスキーマ
 */
export const UserSchema = z.object({
  id: z.string(), // Socket.IOのコネクションID
  name: z.string(), // 参加時に設定するユーザー名
});
export type User = z.infer<typeof UserSchema>;

/**
 * ゲームの状態を表すスキーマ
 * LOBBY: 待機中
 * IN_GAME: ゲームプレイ中
 * RESULTS: 結果鑑賞中
 */
export const GameStateSchema = z.enum(["LOBBY", "IN_GAME", "RESULTS"]);
export type GameState = z.infer<typeof GameStateSchema>;

/**
 * 部屋の状態を表すスキーマ。このオブジェクトがクライアントのUIの基礎となります。
 */
export const RoomStateSchema = z.object({
  roomCode: z.string(), // 部屋の合言葉
  users: z.array(UserSchema), // 部屋にいるユーザーのリスト
  hostId: z.string(), // ホスト（部屋の作成者）のID
  gameState: GameStateSchema, // 現在のゲーム状態
});
export type RoomState = z.infer<typeof RoomStateSchema>;

/**
 * ゲーム中のお題を表すスキーマ
 */
export const PromptSchema = z.object({
  html: z.string(), // プレイヤーがスタイリングする対象のHTML
  targetImageUrl: z.string(), // 目標となるスクリーンショットのURL
});
export type Prompt = z.infer<typeof PromptSchema>;

/**

 * プレイヤーがCSSを提出する際のペイロードスキーマ
 */
export const SubmitCssSchema = z.object({
  css: z.string(),
});
export type SubmitCssPayload = z.infer<typeof SubmitCssSchema>;

/**
 * 結果鑑賞画面で表示される、1つの伝言ステップ（誰が、何を作り、どうなったか）
 */
export const ResultStepSchema = z.object({
  author: UserSchema, // このCSSを書いた人
  submittedCss: z.string(), // 提出されたCSS
  resultImageUrl: z.string(), // CSSを適用した結果のスクリーンショットURL
});
export type ResultStep = z.infer<typeof ResultStepSchema>;

/**
 * 1つのお題から始まった、一連の伝言のつながり全体
 */
export const ResultChainSchema = z.object({
  initialPrompt: PromptSchema, // 最初のお題
  steps: z.array(ResultStepSchema), // 伝言の過程
});
export type ResultChain = z.infer<typeof ResultChainSchema>;

/**
 * ゲーム終了時にクライアントに送信される、すべての結果データ
 */
export const GameResultsSchema = z.object({
  chains: z.array(ResultChainSchema),
});
export type GameResults = z.infer<typeof GameResultsSchema>;

/**
 * 結果鑑賞中に、次にどのステップを表示するかを指示するスキーマ
 */
export const ShowResultStepSchema = z.object({
  chainIndex: z.number().int().min(0), // 何番目のお題のチェーンか
  stepIndex: z.number().int().min(0), // そのチェーンの何番目のステップか
});
export type ShowResultStepPayload = z.infer<typeof ShowResultStepSchema>;

// ====================================================================================
//  2. サーバー -> クライアント のイベント定義 (Server to Client Events)
// サーバーがクライアントに送信する可能性のあるすべてのイベントを定義します。
// ====================================================================================

export interface ServerToClientEvents {
  /**
   * 部屋の状態が更新されたことを全クライアントに通知します。
   * (ユーザーの参加/退出、ゲーム状態の変更など)
   */
  updateRoomState: (roomState: RoomState) => void;

  /**
   * ゲーム開始を通知し、各クライアントに固有の初期お題を送信します。
   */
  gameStart: (initialPrompt: Prompt) => void;

  /**
   * 新しいターンの開始を通知し、次のお題を送信します。
   * (前ターンの誰かの結果が次のお題になります)
   */
  newTurn: (prompt: Prompt, turnNumber: number, totalTurns: number) => void;

  /**
   * ターンやゲームの制限時間をクライアントに通知します。
   */
  timerUpdate: (remainingTimeInSeconds: number) => void;

  /**
   * 全員の全ターンが終了したことを通知し、結果鑑賞フェーズに移行します。
   * すべての結果データをこのタイミングで送信します。
   */
  gameFinished: (results: GameResults) => void;

  /**
   * 結果鑑賞中、ホストの操作に応じて次に表示する結果を全クライアントに指示します。
   */
  showNextResult: (payload: ShowResultStepPayload) => void;

  /**
   * 結果鑑賞がすべて終わり、ロビー（待機画面）に戻ることを指示します。
   */
  lobbyReset: () => void;

  /**
   * 何らかのエラーが発生したことをクライアントに通知します。
   * (例: 部屋が存在しない、不正な操作など)
   */
  error: (payload: { message: string }) => void;
}

// ====================================================================================
//  3. クライアント -> サーバー のイベント定義 (Client to Server Events)
// クライアントがサーバーに送信する可能性のあるすべてのイベントを定義します。
// コールバック関数(ack)を使うことで、クライアントはサーバーでの処理結果を直接受け取れます。
// ====================================================================================

export interface ClientToServerEvents {
  /**
   * ユーザーが合言葉と名前を使って部屋に参加/作成します。
   * 成功した場合、ackで最新の部屋の状態が返されます。
   */
  joinRoom: (
    payload: { roomCode: string; name: string },
    ack: (
      response:
        | { success: true; roomState: RoomState }
        | { success: false; message: string },
    ) => void,
  ) => void;

  /**
   * ホストがゲームの開始をサーバーに要求します。
   */
  startGame: (
    ack: (response: {
      success: boolean;
      roomState: RoomState | undefined;
    }) => void,
  ) => void;

  /**
   * プレイヤーが書いたCSSをサーバーに提出します。
   */
  submitCss: (
    payload: SubmitCssPayload,
    ack: (response: { success: boolean; message: string }) => void,
  ) => void;

  /**
   * 結果鑑賞画面で、ホストが「次へ」ボタンを押したことをサーバーに通知します。
   */
  nextResultStep: () => void;

  /**
   * 結果鑑賞が終わり、ホストが「ロビーに戻る」を選択したことをサーバーに通知します。
   */
  returnToLobby: () => void;
}
