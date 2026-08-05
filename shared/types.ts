/**
 * Avalon Companion - 共享领域类型
 *
 * 这一层被「服务端权威引擎」与「单人测试模式」共同引用，
 * 保证线上房间与本地测试跑的是同一套规则。
 */

export type Role =
  | 'MERLIN'
  | 'PERCIVAL'
  | 'LOYAL_SERVANT'
  | 'ASSASSIN'
  | 'MORGANA'
  | 'MORDRED'
  | 'OBERON'
  | 'MINION';

export type Alignment = 'GOOD' | 'EVIL';

/** 房间有限状态机 */
export type RoomStatus =
  | 'LOBBY'
  | 'ROLE_CONFIGURATION'
  | 'ROLE_REVEAL'
  | 'WAITING_FOR_CONFIRMATION'
  | 'IN_GAME'
  | 'LADY_OF_THE_LAKE'
  | 'ASSASSINATION'
  | 'GAME_OVER'
  | 'RESTARTING'
  | 'DISSOLVED';

export type QuestOutcome = 'SUCCESS' | 'FAIL';

export type Winner = 'GOOD' | 'EVIL' | null;

export type EndReason =
  | 'EVIL_THREE_FAILS'
  | 'ASSASSIN_HIT'
  | 'ASSASSIN_MISS'
  | 'FIVE_REJECTS'
  | null;

/** 秘密信息的语义标签（前端据此渲染不同措辞，且不泄露具体角色） */
export type KnownLabel = 'EVIL_SENSED' | 'MERLIN_CANDIDATES' | 'EVIL_TEAMMATES';

export interface RoleConfig {
  /** 派西维尔（好人，推荐默认开启） */
  percival: boolean;
  /** 莫甘娜（坏人，推荐默认开启） */
  morgana: boolean;
  /** 莫德雷德（坏人，可选） */
  mordred: boolean;
  /** 奥伯伦（坏人，可选） */
  oberon: boolean;
  /** 湖上夫人扩展（7-10 人可用） */
  ladyOfTheLake: boolean;
}

export interface Player {
  id: string;
  nickname: string;
  seatIndex: number;
  isHost: boolean;
  online: boolean;
  /** 加入时记录的设备指纹；同一设备重复加入同一房间时用于恢复席位，而非新建玩家 */
  deviceId: string;
  /** 只存哈希，明文 token 仅存在于玩家自己的设备 */
  reconnectTokenHash: string;
  joinedAt: number;
  lastSeenAt: number;
  roleConfirmed: boolean;
  /** 永久离开的时间戳；null 表示仍在座位上（可能只是离线） */
  leftAt: number | null;
}

export interface SecretAssignment {
  playerId: string;
  role: Role;
  alignment: Alignment;
  /** 发牌时即固化的「我能看到的人」，顺序已随机，避免刷新后顺序变化泄露信息 */
  knownPlayerIds: string[];
  knownLabel: KnownLabel | null;
}

export interface QuestRecord {
  questNumber: number;
  result: QuestOutcome;
  recordedBy: string;
  createdAt: number;
}

export interface LadyCheckRecord {
  order: number;
  viewerPlayerId: string;
  targetPlayerId: string;
  /** 私密结果：只会下发给 viewer 本人 */
  targetAlignment: Alignment;
  questNumber: number;
  createdAt: number;
}

export interface LadyState {
  enabled: boolean;
  currentHolderPlayerId: string | null;
  previousHolderIds: string[];
  useCount: number;
  /** 已选择但持有者尚未确认转交的目标 */
  pendingTargetPlayerId: string | null;
  /** 本次流程由第几次任务触发 */
  pendingAfterQuest: number | null;
  completedChecks: LadyCheckRecord[];
}

export interface Assassination {
  assassinPlayerId: string;
  targetPlayerId: string;
  submittedAt: number;
  successful: boolean;
}

export interface SeatClaim {
  id: string;
  targetPlayerId: string;
  nickname: string;
  requestedAt: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** 房主批准后写入，新设备凭此换取控制权 */
  newTokenHash: string | null;
}

export interface PauseState {
  reason: 'PLAYER_LEFT';
  playerId: string;
}

export interface Room {
  id: string;
  roomCode: string;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  hostPlayerId: string;
  hostTokenHash: string;
  players: Player[];
  /** 环形座位顺序（playerId 列表），湖上夫人的「右侧」按此计算 */
  playerOrder: string[];
  firstLeaderPlayerId: string | null;
  roleConfig: RoleConfig;
  /** 服务端秘密数据，永不整体下发 */
  assignments: SecretAssignment[];
  quests: QuestRecord[];
  lady: LadyState;
  assassination: Assassination | null;
  currentQuestNumber: number;
  goodSuccessCount: number;
  evilFailCount: number;
  winner: Winner;
  endReason: EndReason;
  pause: PauseState | null;
  seatClaims: SeatClaim[];
  /** 乐观锁版本号 */
  version: number;
  /** 每次发牌自增，用于区分「第几局」 */
  gameSerial: number;
  /** 幂等去重：最近处理过的 actionId */
  processedActionIds: string[];
}

/* ------------------------------------------------------------------ *
 * 下发给客户端的视图（严格按玩家裁剪）
 * ------------------------------------------------------------------ */

export interface PublicPlayerView {
  id: string;
  nickname: string;
  seatIndex: number;
  isHost: boolean;
  online: boolean;
  roleConfirmed: boolean;
  hasLeft: boolean;
  isFirstLeader: boolean;
  holdsLady: boolean;
  heldLadyBefore: boolean;
}

export interface KnownPlayerView {
  id: string;
  nickname: string;
}

export interface PrivateIdentityView {
  role: Role;
  alignment: Alignment;
  knownLabel: KnownLabel | null;
  knownPlayers: KnownPlayerView[];
  /** i18n key 列表，由前端翻译 */
  noteKeys: string[];
}

export interface LadyPromptView {
  eligibleTargets: { id: string; nickname: string; online: boolean }[];
  pendingTarget: { id: string; nickname: string } | null;
  /** 只有持有者本人能拿到 */
  pendingResult: Alignment | null;
}

export interface LadyPrivateResultView {
  order: number;
  targetPlayerId: string;
  targetNickname: string;
  targetAlignment: Alignment;
  questNumber: number;
}

export interface AssassinPromptView {
  candidates: { id: string; nickname: string }[];
}

export interface RevealedRoleView {
  playerId: string;
  nickname: string;
  role: Role;
  alignment: Alignment;
}

export interface PublicRoomView {
  id: string;
  roomCode: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: PublicPlayerView[];
  playerOrder: string[];
  firstLeaderPlayerId: string | null;
  roleConfig: RoleConfig;
  /** 本局在场角色（阿瓦隆中角色配置是公开信息） */
  composition: Role[] | null;
  quests: { questNumber: number; result: QuestOutcome }[];
  currentQuestNumber: number;
  goodSuccessCount: number;
  evilFailCount: number;
  winner: Winner;
  endReason: EndReason;
  pause: PauseState | null;
  lady: {
    enabled: boolean;
    currentHolderPlayerId: string | null;
    previousHolderIds: string[];
    useCount: number;
    pendingTargetPlayerId: string | null;
    /** 公共历史只含「谁查看了谁」，不含结果 */
    history: { order: number; viewerPlayerId: string; targetPlayerId: string; questNumber: number }[];
  };
  assassination: { assassinSubmitted: boolean; targetPlayerId: string | null } | null;
  confirmation: { confirmed: number; total: number };
  expiresAt: number;
  version: number;
}

export interface PlayerView {
  room: PublicRoomView;
  me: {
    id: string;
    nickname: string;
    seatIndex: number;
    isHost: boolean;
    roleConfirmed: boolean;
  } | null;
  identity: PrivateIdentityView | null;
  ladyPrompt: LadyPromptView | null;
  ladyIncoming: { holderNickname: string } | null;
  myLadyResults: LadyPrivateResultView[];
  assassinPrompt: AssassinPromptView | null;
  fullReveal: RevealedRoleView[] | null;
  pendingSeatClaims: SeatClaim[];
  serverTime: number;
}
