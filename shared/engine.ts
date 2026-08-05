/**
 * Avalon Companion —— 权威游戏引擎（纯逻辑，无 IO）
 *
 * 服务端与单人测试模式共用同一份实现，避免两套规则漂移。
 * 所有函数原地修改传入的 Room 对象；调用方负责事务/加锁/持久化。
 */

import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  MAX_QUESTS,
  WIN_THRESHOLD,
  LADY_MAX_USES,
  LADY_TRIGGER_QUESTS,
  buildRoleComposition,
} from './roles';
import { dealAssignments, noteKeysFor } from './visibility';
import type { Rng } from './random';
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PROCESSED_ACTION_CACHE,
  ROOM_INITIAL_TTL_MS,
  ROOM_TTL_MS,
} from './constants';
import type {
  Alignment,
  PlayerView,
  PublicPlayerView,
  PublicRoomView,
  QuestOutcome,
  Role,
  RoleConfig,
  Room,
  RoomStatus,
  SeatClaim,
  Player,
} from './types';

/* ------------------------------------------------------------------ *
 * 错误
 * ------------------------------------------------------------------ */

export class EngineError extends Error {
  readonly code: string;
  readonly params: Record<string, string | number> | undefined;

  constructor(code: string, params?: Record<string, string | number>) {
    super(code);
    this.name = 'EngineError';
    this.code = code;
    this.params = params;
  }
}

function assert(condition: unknown, code: string, params?: Record<string, string | number>): asserts condition {
  if (!condition) throw new EngineError(code, params);
}

/* ------------------------------------------------------------------ *
 * 状态机
 * ------------------------------------------------------------------ */

export const STATUS_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  LOBBY: ['ROLE_CONFIGURATION', 'ROLE_REVEAL', 'DISSOLVED'],
  ROLE_CONFIGURATION: ['LOBBY', 'ROLE_REVEAL', 'DISSOLVED'],
  ROLE_REVEAL: ['WAITING_FOR_CONFIRMATION', 'IN_GAME', 'RESTARTING', 'DISSOLVED'],
  WAITING_FOR_CONFIRMATION: ['IN_GAME', 'RESTARTING', 'DISSOLVED'],
  IN_GAME: ['LADY_OF_THE_LAKE', 'ASSASSINATION', 'GAME_OVER', 'RESTARTING', 'DISSOLVED'],
  LADY_OF_THE_LAKE: ['IN_GAME', 'ASSASSINATION', 'GAME_OVER', 'RESTARTING', 'DISSOLVED'],
  ASSASSINATION: ['GAME_OVER', 'IN_GAME', 'RESTARTING', 'DISSOLVED'],
  GAME_OVER: ['IN_GAME', 'RESTARTING', 'DISSOLVED'],
  RESTARTING: ['ROLE_CONFIGURATION', 'LOBBY', 'DISSOLVED'],
  DISSOLVED: [],
};

function setStatus(room: Room, next: RoomStatus): void {
  if (room.status === next) return;
  const allowed = STATUS_TRANSITIONS[room.status];
  assert(allowed.includes(next), 'ILLEGAL_STATE_TRANSITION', { from: room.status, to: next });
  room.status = next;
}

/** 尚未发牌的阶段 */
export const PREGAME_STATUSES: RoomStatus[] = ['LOBBY', 'ROLE_CONFIGURATION', 'RESTARTING'];

/* ------------------------------------------------------------------ *
 * Actor / Action
 * ------------------------------------------------------------------ */

export interface Actor {
  playerId: string | null;
  /** 只能由服务端校验 hostToken 后置为 true —— 前端无法伪造 */
  hostVerified: boolean;
}

export type Action =
  | { type: 'OPEN_ROLE_CONFIG' }
  | { type: 'BACK_TO_LOBBY' }
  | { type: 'SET_ROLE_CONFIG'; config: RoleConfig }
  | { type: 'SET_SEAT_ORDER'; order: string[] }
  | { type: 'SET_FIRST_LEADER'; playerId: string | null }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'TRANSFER_HOST'; playerId: string }
  | { type: 'START_GAME' }
  | { type: 'CONFIRM_ROLE' }
  | { type: 'RECORD_QUEST'; result: QuestOutcome }
  | { type: 'UNDO_QUEST' }
  | { type: 'FIVE_REJECTS' }
  | { type: 'LADY_SELECT_TARGET'; targetPlayerId: string }
  | { type: 'LADY_ACKNOWLEDGE' }
  | { type: 'SUBMIT_ASSASSINATION'; targetPlayerId: string }
  | { type: 'RESTART' }
  | { type: 'DISSOLVE' }
  | { type: 'LEAVE_ROOM' }
  | { type: 'RESOLVE_ABSENCE'; mode: 'WAIT' | 'RESTART' }
  | { type: 'RESOLVE_SEAT_CLAIM'; claimId: string; approve: boolean };

export interface ActionContext {
  now: number;
  rng: Rng;
  /** 幂等标识；重复提交同一个 actionId 会被安全忽略 */
  actionId?: string;
}

/* ------------------------------------------------------------------ *
 * 构造
 * ------------------------------------------------------------------ */

export function normalizeNickname(raw: string): string {
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim();
  assert(trimmed.length >= NICKNAME_MIN_LENGTH, 'NICKNAME_REQUIRED');
  assert(trimmed.length <= NICKNAME_MAX_LENGTH, 'NICKNAME_TOO_LONG', { max: NICKNAME_MAX_LENGTH });
  return trimmed;
}

export interface CreateRoomInput {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  hostNickname: string;
  hostTokenHash: string;
  playerTokenHash: string;
  now: number;
  roleConfig: RoleConfig;
  deviceId: string;
}

export function createRoom(input: CreateRoomInput): Room {
  const nickname = normalizeNickname(input.hostNickname);
  const host: Player = {
    id: input.hostPlayerId,
    nickname,
    seatIndex: 0,
    isHost: true,
    online: true,
    deviceId: input.deviceId,
    reconnectTokenHash: input.playerTokenHash,
    joinedAt: input.now,
    lastSeenAt: input.now,
    roleConfirmed: false,
    leftAt: null,
  };
  return {
    id: input.roomId,
    roomCode: input.roomCode,
    status: 'LOBBY',
    createdAt: input.now,
    updatedAt: input.now,
    expiresAt: input.now + ROOM_INITIAL_TTL_MS,
    hostPlayerId: host.id,
    hostTokenHash: input.hostTokenHash,
    players: [host],
    playerOrder: [host.id],
    firstLeaderPlayerId: null,
    roleConfig: { ...input.roleConfig },
    assignments: [],
    quests: [],
    lady: {
      enabled: input.roleConfig.ladyOfTheLake,
      currentHolderPlayerId: null,
      previousHolderIds: [],
      useCount: 0,
      pendingTargetPlayerId: null,
      pendingAfterQuest: null,
      completedChecks: [],
    },
    assassination: null,
    currentQuestNumber: 1,
    goodSuccessCount: 0,
    evilFailCount: 0,
    winner: null,
    endReason: null,
    pause: null,
    seatClaims: [],
    version: 1,
    gameSerial: 0,
    processedActionIds: [],
  };
}

export interface JoinRoomInput {
  playerId: string;
  nickname: string;
  tokenHash: string;
  now: number;
  deviceId: string;
}

export function addPlayer(room: Room, input: JoinRoomInput): Player {
  assert(room.status !== 'DISSOLVED', 'ROOM_DISSOLVED');
  assert(PREGAME_STATUSES.includes(room.status), 'GAME_ALREADY_STARTED');
  const activePlayers = room.players.filter((p) => p.leftAt === null);
  assert(activePlayers.length < MAX_PLAYERS, 'ROOM_FULL', { max: MAX_PLAYERS });

  const nickname = normalizeNickname(input.nickname);
  const duplicate = room.players.some(
    (p) => p.leftAt === null && p.nickname.toLowerCase() === nickname.toLowerCase(),
  );
  assert(!duplicate, 'NICKNAME_TAKEN');

  const player: Player = {
    id: input.playerId,
    nickname,
    seatIndex: room.playerOrder.length,
    isHost: false,
    online: true,
    deviceId: input.deviceId,
    reconnectTokenHash: input.tokenHash,
    joinedAt: input.now,
    lastSeenAt: input.now,
    roleConfirmed: false,
    leftAt: null,
  };
  room.players.push(player);
  room.playerOrder.push(player.id);
  reindexSeats(room);
  touchRoom(room, input.now);
  return player;
}

/** 丢失重连凭证时申请恢复席位，需房主批准 */
export function requestSeatClaim(
  room: Room,
  input: { claimId: string; targetPlayerId: string; newTokenHash: string; now: number },
): SeatClaim {
  assert(room.status !== 'DISSOLVED', 'ROOM_DISSOLVED');
  const target = room.players.find((p) => p.id === input.targetPlayerId);
  assert(target, 'PLAYER_NOT_FOUND');
  const claim: SeatClaim = {
    id: input.claimId,
    targetPlayerId: target.id,
    nickname: target.nickname,
    requestedAt: input.now,
    status: 'PENDING',
    newTokenHash: input.newTokenHash,
  };
  room.seatClaims = room.seatClaims.filter((c) => c.targetPlayerId !== target.id || c.status !== 'PENDING');
  room.seatClaims.push(claim);
  touchRoom(room, input.now);
  return claim;
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function touchRoom(room: Room, now: number): void {
  room.updatedAt = now;
  room.version += 1;
  room.expiresAt = now + ROOM_TTL_MS;
}

function reindexSeats(room: Room): void {
  room.playerOrder.forEach((id, index) => {
    const player = room.players.find((p) => p.id === id);
    if (player) player.seatIndex = index;
  });
}

export function activePlayers(room: Room): Player[] {
  return room.playerOrder
    .map((id) => room.players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p) && p!.leftAt === null);
}

export function findPlayer(room: Room, playerId: string | null | undefined): Player | undefined {
  if (!playerId) return undefined;
  return room.players.find((p) => p.id === playerId);
}

function assignmentOf(room: Room, playerId: string) {
  return room.assignments.find((a) => a.playerId === playerId);
}

function requireHost(room: Room, actor: Actor): void {
  assert(actor.hostVerified, 'HOST_ONLY');
  assert(actor.playerId === room.hostPlayerId, 'HOST_ONLY');
}

function requireSelf(actor: Actor): string {
  assert(actor.playerId, 'PLAYER_REQUIRED');
  return actor.playerId;
}

/** 环形座位中「右侧」的下一位在场玩家 */
export function playerToTheRight(room: Room, playerId: string): string | null {
  const order = room.playerOrder.filter((id) => {
    const p = findPlayer(room, id);
    return p && p.leftAt === null;
  });
  const index = order.indexOf(playerId);
  if (index === -1 || order.length < 2) return null;
  return order[(index + 1) % order.length]!;
}

export function currentComposition(room: Room) {
  return buildRoleComposition(activePlayers(room).length, room.roleConfig);
}

function clearGameData(room: Room): void {
  room.assignments = [];
  room.quests = [];
  room.assassination = null;
  room.currentQuestNumber = 1;
  room.goodSuccessCount = 0;
  room.evilFailCount = 0;
  room.winner = null;
  room.endReason = null;
  room.pause = null;
  room.lady = {
    enabled: room.roleConfig.ladyOfTheLake,
    currentHolderPlayerId: null,
    previousHolderIds: [],
    useCount: 0,
    pendingTargetPlayerId: null,
    pendingAfterQuest: null,
    completedChecks: [],
  };
  room.players.forEach((p) => {
    p.roleConfirmed = false;
  });
}

function recomputeQuestCounters(room: Room): void {
  room.goodSuccessCount = room.quests.filter((q) => q.result === 'SUCCESS').length;
  room.evilFailCount = room.quests.filter((q) => q.result === 'FAIL').length;
  room.currentQuestNumber = Math.min(room.quests.length + 1, MAX_QUESTS);
}

/* ------------------------------------------------------------------ *
 * 主分发
 * ------------------------------------------------------------------ */

export function applyAction(room: Room, actor: Actor, action: Action, ctx: ActionContext): void {
  assert(room.status !== 'DISSOLVED', 'ROOM_DISSOLVED');

  if (ctx.actionId) {
    if (room.processedActionIds.includes(ctx.actionId)) {
      throw new EngineError('DUPLICATE_ACTION');
    }
  }

  switch (action.type) {
    case 'OPEN_ROLE_CONFIG': {
      requireHost(room, actor);
      assert(
        room.status === 'LOBBY' || room.status === 'RESTARTING',
        'INVALID_STATE_FOR_ACTION',
      );
      setStatus(room, 'ROLE_CONFIGURATION');
      break;
    }

    case 'BACK_TO_LOBBY': {
      requireHost(room, actor);
      assert(room.status === 'ROLE_CONFIGURATION' || room.status === 'RESTARTING', 'INVALID_STATE_FOR_ACTION');
      setStatus(room, 'LOBBY');
      break;
    }

    case 'SET_ROLE_CONFIG': {
      requireHost(room, actor);
      assert(PREGAME_STATUSES.includes(room.status), 'INVALID_STATE_FOR_ACTION');
      room.roleConfig = {
        percival: Boolean(action.config.percival),
        morgana: Boolean(action.config.morgana),
        mordred: Boolean(action.config.mordred),
        oberon: Boolean(action.config.oberon),
        ladyOfTheLake: Boolean(action.config.ladyOfTheLake),
      };
      room.lady.enabled = room.roleConfig.ladyOfTheLake;
      break;
    }

    case 'SET_SEAT_ORDER': {
      requireHost(room, actor);
      assert(PREGAME_STATUSES.includes(room.status), 'SEATS_LOCKED');
      const current = room.playerOrder.slice().sort();
      const next = action.order.slice().sort();
      assert(
        current.length === next.length && current.every((id, i) => id === next[i]),
        'SEAT_ORDER_MISMATCH',
      );
      room.playerOrder = action.order.slice();
      reindexSeats(room);
      break;
    }

    case 'SET_FIRST_LEADER': {
      requireHost(room, actor);
      assert(PREGAME_STATUSES.includes(room.status), 'SEATS_LOCKED');
      if (action.playerId === null) {
        room.firstLeaderPlayerId = null;
      } else {
        const target = findPlayer(room, action.playerId);
        assert(target && target.leftAt === null, 'PLAYER_NOT_FOUND');
        room.firstLeaderPlayerId = target.id;
      }
      break;
    }

    case 'REMOVE_PLAYER': {
      requireHost(room, actor);
      assert(PREGAME_STATUSES.includes(room.status), 'CANNOT_REMOVE_AFTER_DEAL');
      assert(action.playerId !== room.hostPlayerId, 'CANNOT_REMOVE_HOST');
      const exists = findPlayer(room, action.playerId);
      assert(exists, 'PLAYER_NOT_FOUND');
      room.players = room.players.filter((p) => p.id !== action.playerId);
      room.playerOrder = room.playerOrder.filter((id) => id !== action.playerId);
      if (room.firstLeaderPlayerId === action.playerId) room.firstLeaderPlayerId = null;
      reindexSeats(room);
      break;
    }

    case 'TRANSFER_HOST': {
      requireHost(room, actor);
      assert(PREGAME_STATUSES.includes(room.status), 'INVALID_STATE_FOR_ACTION');
      const target = findPlayer(room, action.playerId);
      assert(target && target.leftAt === null, 'PLAYER_NOT_FOUND');
      room.players.forEach((p) => {
        p.isHost = p.id === target.id;
      });
      room.hostPlayerId = target.id;
      // hostTokenHash 由服务层轮换后写入
      break;
    }

    case 'START_GAME': {
      requireHost(room, actor);
      assert(PREGAME_STATUSES.includes(room.status), 'GAME_ALREADY_STARTED');
      assert(room.assignments.length === 0, 'ALREADY_DEALT');
      const players = activePlayers(room);
      assert(players.length >= MIN_PLAYERS, 'NOT_ENOUGH_PLAYERS', { min: MIN_PLAYERS });
      assert(players.length <= MAX_PLAYERS, 'TOO_MANY_PLAYERS', { max: MAX_PLAYERS });
      assert(
        room.players.every((p) => p.leftAt === null),
        'PLAYERS_UNSTABLE',
      );

      const composition = buildRoleComposition(players.length, room.roleConfig);
      assert(composition.valid, composition.errors[0]?.code ?? 'INVALID_ROLE_CONFIG');
      assert(composition.roles.length === players.length, 'ROLE_COUNT_MISMATCH');

      if (room.roleConfig.ladyOfTheLake) {
        assert(room.firstLeaderPlayerId, 'FIRST_LEADER_REQUIRED');
      }

      clearGameData(room);
      room.assignments = dealAssignments(
        players.map((p) => p.id),
        composition.roles,
        ctx.rng,
      );
      room.gameSerial += 1;
      room.lady.enabled = room.roleConfig.ladyOfTheLake;
      if (room.lady.enabled && room.firstLeaderPlayerId) {
        room.lady.currentHolderPlayerId = playerToTheRight(room, room.firstLeaderPlayerId);
      }
      setStatus(room, 'ROLE_REVEAL');
      break;
    }

    case 'CONFIRM_ROLE': {
      const selfId = requireSelf(actor);
      assert(
        room.status === 'ROLE_REVEAL' || room.status === 'WAITING_FOR_CONFIRMATION',
        'INVALID_STATE_FOR_ACTION',
      );
      const me = findPlayer(room, selfId);
      assert(me, 'PLAYER_NOT_FOUND');
      assert(assignmentOf(room, selfId), 'NO_ASSIGNMENT');
      me.roleConfirmed = true;
      const players = activePlayers(room);
      const allConfirmed = players.every((p) => p.roleConfirmed);
      if (allConfirmed) {
        if (room.status === 'ROLE_REVEAL') setStatus(room, 'WAITING_FOR_CONFIRMATION');
        setStatus(room, 'IN_GAME');
        room.currentQuestNumber = 1;
      } else if (room.status === 'ROLE_REVEAL') {
        setStatus(room, 'WAITING_FOR_CONFIRMATION');
      }
      break;
    }

    case 'RECORD_QUEST': {
      requireHost(room, actor);
      assert(room.status === 'IN_GAME', 'INVALID_STATE_FOR_ACTION');
      assert(!room.pause, 'GAME_PAUSED');
      assert(room.quests.length < MAX_QUESTS, 'ALL_QUESTS_RECORDED');
      room.quests.push({
        questNumber: room.quests.length + 1,
        result: action.result,
        recordedBy: actor.playerId!,
        createdAt: ctx.now,
      });
      recomputeQuestCounters(room);
      advanceAfterQuest(room);
      break;
    }

    case 'UNDO_QUEST': {
      requireHost(room, actor);
      assert(room.quests.length > 0, 'NOTHING_TO_UNDO');
      assert(!room.assassination, 'ASSASSINATION_SUBMITTED');
      const last = room.quests[room.quests.length - 1]!;
      const ladyUsedForThisQuest = room.lady.completedChecks.some((c) => c.questNumber === last.questNumber);
      assert(!ladyUsedForThisQuest, 'LADY_ALREADY_USED_FOR_QUEST');
      assert(
        ['IN_GAME', 'LADY_OF_THE_LAKE', 'ASSASSINATION', 'GAME_OVER'].includes(room.status),
        'INVALID_STATE_FOR_ACTION',
      );
      room.quests.pop();
      room.lady.pendingTargetPlayerId = null;
      room.lady.pendingAfterQuest = null;
      room.winner = null;
      room.endReason = null;
      recomputeQuestCounters(room);
      setStatus(room, 'IN_GAME');
      break;
    }

    case 'FIVE_REJECTS': {
      requireHost(room, actor);
      assert(room.status === 'IN_GAME', 'INVALID_STATE_FOR_ACTION');
      room.winner = 'EVIL';
      room.endReason = 'FIVE_REJECTS';
      setStatus(room, 'GAME_OVER');
      break;
    }

    case 'LADY_SELECT_TARGET': {
      const selfId = requireSelf(actor);
      assert(room.status === 'LADY_OF_THE_LAKE', 'INVALID_STATE_FOR_ACTION');
      assert(room.lady.currentHolderPlayerId === selfId, 'NOT_LADY_HOLDER');
      assert(room.lady.pendingTargetPlayerId === null, 'LADY_CHECK_IN_PROGRESS');
      assert(action.targetPlayerId !== selfId, 'LADY_CANNOT_TARGET_SELF');
      const target = findPlayer(room, action.targetPlayerId);
      assert(target && target.leftAt === null, 'PLAYER_NOT_FOUND');
      assert(!room.lady.previousHolderIds.includes(target.id), 'LADY_TARGET_ALREADY_HELD');
      const targetAssignment = assignmentOf(room, target.id);
      assert(targetAssignment, 'NO_ASSIGNMENT');

      room.lady.pendingTargetPlayerId = target.id;
      room.lady.completedChecks.push({
        order: room.lady.completedChecks.length + 1,
        viewerPlayerId: selfId,
        targetPlayerId: target.id,
        targetAlignment: targetAssignment.alignment,
        questNumber: room.lady.pendingAfterQuest ?? room.quests.length,
        createdAt: ctx.now,
      });
      break;
    }

    case 'LADY_ACKNOWLEDGE': {
      const selfId = requireSelf(actor);
      assert(room.status === 'LADY_OF_THE_LAKE', 'INVALID_STATE_FOR_ACTION');
      assert(room.lady.currentHolderPlayerId === selfId, 'NOT_LADY_HOLDER');
      const targetId = room.lady.pendingTargetPlayerId;
      assert(targetId, 'LADY_NO_PENDING_TARGET');
      room.lady.previousHolderIds.push(selfId);
      room.lady.currentHolderPlayerId = targetId;
      room.lady.pendingTargetPlayerId = null;
      room.lady.pendingAfterQuest = null;
      room.lady.useCount += 1;
      setStatus(room, 'IN_GAME');
      break;
    }

    case 'SUBMIT_ASSASSINATION': {
      const selfId = requireSelf(actor);
      assert(room.status === 'ASSASSINATION', 'INVALID_STATE_FOR_ACTION');
      assert(room.assassination === null, 'ASSASSINATION_SUBMITTED');
      const mine = assignmentOf(room, selfId);
      assert(mine && mine.role === 'ASSASSIN', 'ASSASSIN_ONLY');
      const target = assignmentOf(room, action.targetPlayerId);
      assert(target, 'PLAYER_NOT_FOUND');
      assert(target.playerId !== selfId, 'ASSASSIN_TARGET_INVALID');
      // 刻意不校验目标阵营：若只允许刺杀好人，一旦奥伯伦在场，
      // 「选不了谁」本身就会把奥伯伦的身份泄露给刺客。
      const successful = target.role === 'MERLIN';
      room.assassination = {
        assassinPlayerId: selfId,
        targetPlayerId: target.playerId,
        submittedAt: ctx.now,
        successful,
      };
      room.winner = successful ? 'EVIL' : 'GOOD';
      room.endReason = successful ? 'ASSASSIN_HIT' : 'ASSASSIN_MISS';
      setStatus(room, 'GAME_OVER');
      break;
    }

    case 'RESTART': {
      requireHost(room, actor);
      assert(room.status !== 'LOBBY' && room.status !== 'ROLE_CONFIGURATION', 'NOTHING_TO_RESTART');
      clearGameData(room);
      setStatus(room, 'RESTARTING');
      break;
    }

    case 'DISSOLVE': {
      requireHost(room, actor);
      clearGameData(room);
      room.status = 'DISSOLVED';
      break;
    }

    case 'LEAVE_ROOM': {
      const selfId = requireSelf(actor);
      const me = findPlayer(room, selfId);
      assert(me, 'PLAYER_NOT_FOUND');
      if (PREGAME_STATUSES.includes(room.status)) {
        room.players = room.players.filter((p) => p.id !== selfId);
        room.playerOrder = room.playerOrder.filter((id) => id !== selfId);
        if (room.firstLeaderPlayerId === selfId) room.firstLeaderPlayerId = null;
        if (room.hostPlayerId === selfId) {
          const next = room.players.find((p) => p.leftAt === null);
          if (next) {
            room.players.forEach((p) => {
              p.isHost = p.id === next.id;
            });
            room.hostPlayerId = next.id;
          } else {
            room.status = 'DISSOLVED';
          }
        }
        reindexSeats(room);
      } else {
        // 已发牌：不删除玩家，避免破坏阵营人数，改为暂停并交由房主处置
        me.leftAt = ctx.now;
        me.online = false;
        room.pause = { reason: 'PLAYER_LEFT', playerId: selfId };
      }
      break;
    }

    case 'RESOLVE_ABSENCE': {
      requireHost(room, actor);
      assert(room.pause, 'NOT_PAUSED');
      const missing = findPlayer(room, room.pause.playerId);
      if (action.mode === 'WAIT') {
        if (missing) {
          missing.leftAt = null;
          missing.online = false;
        }
        room.pause = null;
      } else {
        clearGameData(room);
        if (missing) {
          room.players = room.players.filter((p) => p.id !== missing.id);
          room.playerOrder = room.playerOrder.filter((id) => id !== missing.id);
          if (room.firstLeaderPlayerId === missing.id) room.firstLeaderPlayerId = null;
          reindexSeats(room);
        }
        setStatus(room, 'RESTARTING');
      }
      break;
    }

    case 'RESOLVE_SEAT_CLAIM': {
      requireHost(room, actor);
      const claim = room.seatClaims.find((c) => c.id === action.claimId);
      assert(claim, 'CLAIM_NOT_FOUND');
      assert(claim.status === 'PENDING', 'CLAIM_ALREADY_RESOLVED');
      if (!action.approve) {
        claim.status = 'REJECTED';
        break;
      }
      const target = findPlayer(room, claim.targetPlayerId);
      assert(target, 'PLAYER_NOT_FOUND');
      assert(claim.newTokenHash, 'CLAIM_INVALID');
      target.reconnectTokenHash = claim.newTokenHash;
      target.leftAt = null;
      target.online = true;
      target.lastSeenAt = ctx.now;
      claim.status = 'APPROVED';
      if (room.pause && room.pause.playerId === target.id) room.pause = null;
      break;
    }

    default: {
      const never: never = action;
      throw new EngineError('UNKNOWN_ACTION', { type: String((never as { type?: string }).type) });
    }
  }

  if (ctx.actionId) {
    room.processedActionIds.push(ctx.actionId);
    if (room.processedActionIds.length > PROCESSED_ACTION_CACHE) {
      room.processedActionIds = room.processedActionIds.slice(-PROCESSED_ACTION_CACHE);
    }
  }
  touchRoom(room, ctx.now);
}

/** 记录任务结果后的自动流转 */
function advanceAfterQuest(room: Room): void {
  if (room.evilFailCount >= WIN_THRESHOLD) {
    room.winner = 'EVIL';
    room.endReason = 'EVIL_THREE_FAILS';
    setStatus(room, 'GAME_OVER');
    return;
  }
  if (room.goodSuccessCount >= WIN_THRESHOLD) {
    // 好人达成三次成功 —— 不直接宣布胜利，进入刺杀阶段
    setStatus(room, 'ASSASSINATION');
    return;
  }
  const completed = room.quests.length;
  const ladyTriggered =
    room.lady.enabled &&
    (LADY_TRIGGER_QUESTS as readonly number[]).includes(completed) &&
    room.lady.useCount < LADY_MAX_USES &&
    room.lady.currentHolderPlayerId !== null &&
    hasEligibleLadyTarget(room);
  if (ladyTriggered) {
    room.lady.pendingAfterQuest = completed;
    setStatus(room, 'LADY_OF_THE_LAKE');
  }
}

export function eligibleLadyTargets(room: Room): Player[] {
  const holder = room.lady.currentHolderPlayerId;
  if (!holder) return [];
  return activePlayers(room).filter(
    (p) => p.id !== holder && !room.lady.previousHolderIds.includes(p.id),
  );
}

function hasEligibleLadyTarget(room: Room): boolean {
  return eligibleLadyTargets(room).length > 0;
}

/* ------------------------------------------------------------------ *
 * 在线状态
 * ------------------------------------------------------------------ */

export function setPlayerOnline(room: Room, playerId: string, online: boolean, now: number): boolean {
  const player = findPlayer(room, playerId);
  if (!player) return false;
  if (player.online === online) {
    player.lastSeenAt = now;
    return false;
  }
  player.online = online;
  player.lastSeenAt = now;
  room.updatedAt = now;
  room.version += 1;
  if (online) room.expiresAt = now + ROOM_TTL_MS;
  return true;
}

/* ------------------------------------------------------------------ *
 * 视图裁剪 —— 唯一对外出口
 * ------------------------------------------------------------------ */

function toPublicPlayer(room: Room, player: Player): PublicPlayerView {
  return {
    id: player.id,
    nickname: player.nickname,
    seatIndex: player.seatIndex,
    isHost: player.isHost,
    online: player.online,
    roleConfirmed: player.roleConfirmed,
    hasLeft: player.leftAt !== null,
    isFirstLeader: room.firstLeaderPlayerId === player.id,
    holdsLady: room.lady.currentHolderPlayerId === player.id,
    heldLadyBefore: room.lady.previousHolderIds.includes(player.id),
  };
}

function buildPublicRoom(room: Room): PublicRoomView {
  const orderedPlayers = room.playerOrder
    .map((id) => room.players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const composition = currentComposition(room);
  const active = activePlayers(room);
  return {
    id: room.id,
    roomCode: room.roomCode,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    players: orderedPlayers.map((p) => toPublicPlayer(room, p)),
    playerOrder: room.playerOrder.slice(),
    firstLeaderPlayerId: room.firstLeaderPlayerId,
    roleConfig: { ...room.roleConfig },
    // 角色构成在阿瓦隆中属于公开信息；但「谁是谁」永不下发
    composition: composition.valid ? composition.roles.slice().sort() : null,
    quests: room.quests.map((q) => ({ questNumber: q.questNumber, result: q.result })),
    currentQuestNumber: room.currentQuestNumber,
    goodSuccessCount: room.goodSuccessCount,
    evilFailCount: room.evilFailCount,
    winner: room.winner,
    endReason: room.endReason,
    pause: room.pause ? { ...room.pause } : null,
    lady: {
      enabled: room.lady.enabled,
      currentHolderPlayerId: room.lady.currentHolderPlayerId,
      previousHolderIds: room.lady.previousHolderIds.slice(),
      useCount: room.lady.useCount,
      pendingTargetPlayerId: room.lady.pendingTargetPlayerId,
      history: room.lady.completedChecks.map((c) => ({
        order: c.order,
        viewerPlayerId: c.viewerPlayerId,
        targetPlayerId: c.targetPlayerId,
        questNumber: c.questNumber,
      })),
    },
    assassination: room.assassination
      ? { assassinSubmitted: true, targetPlayerId: room.assassination.targetPlayerId }
      : room.status === 'ASSASSINATION'
        ? { assassinSubmitted: false, targetPlayerId: null }
        : null,
    confirmation: {
      confirmed: active.filter((p) => p.roleConfirmed).length,
      total: active.length,
    },
    expiresAt: room.expiresAt,
    version: room.version,
  };
}

/**
 * 生成某个玩家的个人化视图。
 *
 * 这是秘密数据离开服务端的唯一通道：
 * 完整 assignments 只在 GAME_OVER 之后才会以 fullReveal 形式公开。
 */
export function computePlayerView(room: Room, viewerId: string | null, now = Date.now()): PlayerView {
  const publicRoom = buildPublicRoom(room);
  const me = findPlayer(room, viewerId);
  const nicknameOf = (id: string) => findPlayer(room, id)?.nickname ?? '???';

  const myAssignment = me ? assignmentOf(room, me.id) : undefined;
  const identityVisible =
    myAssignment &&
    ['ROLE_REVEAL', 'WAITING_FOR_CONFIRMATION', 'IN_GAME', 'LADY_OF_THE_LAKE', 'ASSASSINATION', 'GAME_OVER'].includes(
      room.status,
    );

  const identity = identityVisible
    ? {
        role: myAssignment.role,
        alignment: myAssignment.alignment,
        knownLabel: myAssignment.knownLabel,
        knownPlayers: myAssignment.knownPlayerIds.map((id) => ({ id, nickname: nicknameOf(id) })),
        noteKeys: noteKeysFor(myAssignment.role),
      }
    : null;

  let ladyPrompt: PlayerView['ladyPrompt'] = null;
  if (me && room.status === 'LADY_OF_THE_LAKE' && room.lady.currentHolderPlayerId === me.id) {
    const pendingId = room.lady.pendingTargetPlayerId;
    const pendingRecord = pendingId
      ? room.lady.completedChecks.find(
          (c) => c.viewerPlayerId === me.id && c.targetPlayerId === pendingId,
        )
      : undefined;
    ladyPrompt = {
      eligibleTargets: eligibleLadyTargets(room).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        online: p.online,
      })),
      pendingTarget: pendingId ? { id: pendingId, nickname: nicknameOf(pendingId) } : null,
      pendingResult: (pendingRecord?.targetAlignment ?? null) as Alignment | null,
    };
  }

  const ladyIncoming =
    me && room.lady.pendingTargetPlayerId === me.id && room.lady.currentHolderPlayerId
      ? { holderNickname: nicknameOf(room.lady.currentHolderPlayerId) }
      : null;

  const myLadyResults = me
    ? room.lady.completedChecks
        .filter((c) => c.viewerPlayerId === me.id)
        .map((c) => ({
          order: c.order,
          targetPlayerId: c.targetPlayerId,
          targetNickname: nicknameOf(c.targetPlayerId),
          targetAlignment: c.targetAlignment,
          questNumber: c.questNumber,
        }))
    : [];

  /**
   * 刺杀候选 = 全部玩家 − 刺客自己 − 刺客已知的坏人队友。
   *
   * 不能简单地「只列好人」：奥伯伦不在刺客的已知名单里，
   * 若按阵营过滤掉他，候选名单本身就等于告诉刺客「他是坏人」。
   */
  const assassinPrompt =
    me && room.status === 'ASSASSINATION' && myAssignment?.role === 'ASSASSIN' && !room.assassination
      ? {
          candidates: room.playerOrder
            .filter(
              (id) =>
                id !== me.id &&
                !myAssignment.knownPlayerIds.includes(id) &&
                room.assignments.some((a) => a.playerId === id),
            )
            .map((id) => ({ id, nickname: nicknameOf(id) })),
        }
      : null;

  const fullReveal =
    room.status === 'GAME_OVER'
      ? room.assignments.map((a) => ({
          playerId: a.playerId,
          nickname: nicknameOf(a.playerId),
          role: a.role as Role,
          alignment: a.alignment,
        }))
      : null;

  return {
    room: publicRoom,
    me: me
      ? {
          id: me.id,
          nickname: me.nickname,
          seatIndex: me.seatIndex,
          isHost: me.isHost,
          roleConfirmed: me.roleConfirmed,
        }
      : null,
    identity,
    ladyPrompt,
    ladyIncoming,
    myLadyResults,
    assassinPrompt,
    fullReveal,
    pendingSeatClaims: me?.isHost ? room.seatClaims.filter((c) => c.status === 'PENDING') : [],
    serverTime: now,
  };
}
