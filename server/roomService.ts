import {
  EngineError,
  addPlayer,
  applyAction,
  computePlayerView,
  createRoom as createRoomEntity,
  findPlayer,
  requestSeatClaim as requestSeatClaimEntity,
  setPlayerOnline,
  type Action,
  type Actor,
} from '../shared/engine';
import { DEFAULT_ROLE_CONFIG, MAX_PLAYERS } from '../shared/roles';
import { createSecureRng } from '../shared/random';
import type { PlayerView, Room } from '../shared/types';
import type { RealtimeRoomProvider } from './store/RealtimeRoomProvider';
import { generateId, generateRoomCode, generateToken, hashToken, verifyToken } from './security';

export interface AuthInput {
  playerId?: string | null;
  playerToken?: string | null;
  hostToken?: string | null;
}

export interface ViewEnvelope {
  view: PlayerView;
  /** 房主权限转移时一次性下发的新令牌 */
  grantedHostToken?: string;
}

export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly params: Record<string, string | number> | undefined;

  constructor(code: string, status = 400, params?: Record<string, string | number>) {
    super(code);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
    this.params = params;
  }
}

const ERROR_STATUS: Record<string, number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_DISSOLVED: 410,
  ROOM_EXPIRED: 410,
  ROOM_FULL: 409,
  NICKNAME_TAKEN: 409,
  GAME_ALREADY_STARTED: 409,
  VERSION_CONFLICT: 409,
  DUPLICATE_ACTION: 409,
  HOST_ONLY: 403,
  ASSASSIN_ONLY: 403,
  NOT_LADY_HOLDER: 403,
  INVALID_CREDENTIALS: 401,
  PLAYER_NOT_FOUND: 404,
};

function toServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  if (error instanceof EngineError) {
    return new ServiceError(error.code, ERROR_STATUS[error.code] ?? 400, error.params);
  }
  if (error instanceof Error && error.message === 'ROOM_NOT_FOUND') {
    return new ServiceError('ROOM_NOT_FOUND', 404);
  }
  return new ServiceError('INTERNAL_ERROR', 500);
}

export class RoomService {
  private readonly store: RealtimeRoomProvider;
  /** 新房主令牌的一次性投递箱，避免把明文令牌写入持久化状态 */
  private readonly hostGrants = new Map<string, { playerId: string; token: string; createdAt: number }>();

  constructor(store: RealtimeRoomProvider) {
    this.store = store;
  }

  /* ------------------------- 房间创建 / 加入 ------------------------- */

  async createRoom(nickname: string): Promise<{
    roomId: string;
    roomCode: string;
    playerId: string;
    playerToken: string;
    hostToken: string;
    view: PlayerView;
  }> {
    try {
      const now = Date.now();
      let roomCode = generateRoomCode();
      for (let i = 0; i < 8 && (await this.store.getByCode(roomCode)); i += 1) {
        roomCode = generateRoomCode();
      }
      if (await this.store.getByCode(roomCode)) {
        throw new ServiceError('ROOM_CODE_EXHAUSTED', 503);
      }

      const playerToken = generateToken();
      const hostToken = generateToken();
      const roomId = generateId();
      const hostPlayerId = generateId();

      const room = createRoomEntity({
        roomId,
        roomCode,
        hostPlayerId,
        hostNickname: nickname,
        hostTokenHash: hashToken(hostToken),
        playerTokenHash: hashToken(playerToken),
        now,
        roleConfig: { ...DEFAULT_ROLE_CONFIG },
      });

      await this.store.create(room);
      return {
        roomId,
        roomCode,
        playerId: hostPlayerId,
        playerToken,
        hostToken,
        view: computePlayerView(room, hostPlayerId, now),
      };
    } catch (error) {
      throw toServiceError(error);
    }
  }

  async joinRoom(
    roomCode: string,
    nickname: string,
  ): Promise<{ roomId: string; roomCode: string; playerId: string; playerToken: string; view: PlayerView }> {
    try {
      const existing = await this.requireRoomByCode(roomCode);
      const playerId = generateId();
      const playerToken = generateToken();
      const now = Date.now();

      const { room } = await this.store.transact(existing.id, (draft) => {
        this.assertUsable(draft);
        addPlayer(draft, { playerId, nickname, tokenHash: hashToken(playerToken), now });
      });

      return {
        roomId: room.id,
        roomCode: room.roomCode,
        playerId,
        playerToken,
        view: computePlayerView(room, playerId, now),
      };
    } catch (error) {
      throw toServiceError(error);
    }
  }

  /** 加入页/恢复席位页使用的最小公开信息 */
  async getRoomSummary(roomCode: string): Promise<{
    roomId: string;
    roomCode: string;
    status: Room['status'];
    playerCount: number;
    maxPlayers: number;
    canJoin: boolean;
    players: { id: string; nickname: string; online: boolean; hasLeft: boolean }[];
  }> {
    const room = await this.requireRoomByCode(roomCode);
    const active = room.players.filter((p) => p.leftAt === null);
    return {
      roomId: room.id,
      roomCode: room.roomCode,
      status: room.status,
      playerCount: active.length,
      maxPlayers: MAX_PLAYERS,
      canJoin:
        ['LOBBY', 'ROLE_CONFIGURATION', 'RESTARTING'].includes(room.status) && active.length < MAX_PLAYERS,
      players: room.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        online: p.online,
        hasLeft: p.leftAt !== null,
      })),
    };
  }

  /* ------------------------------ 读取 ------------------------------ */

  async getView(roomId: string, auth: AuthInput): Promise<ViewEnvelope> {
    try {
      const room = await this.requireRoomById(roomId);
      const actor = this.authorize(room, auth);
      return this.envelope(room, actor.playerId);
    } catch (error) {
      throw toServiceError(error);
    }
  }

  async getViewByCode(roomCode: string, auth: AuthInput): Promise<ViewEnvelope> {
    const room = await this.requireRoomByCode(roomCode);
    return this.getView(room.id, auth);
  }

  /* ------------------------------ 动作 ------------------------------ */

  async dispatch(
    roomId: string,
    auth: AuthInput,
    action: Action,
    options: { expectedVersion?: number; actionId?: string } = {},
  ): Promise<ViewEnvelope> {
    try {
      const before = await this.requireRoomById(roomId);
      const actor = this.authorize(before, auth);

      const rng = createSecureRng();
      const now = Date.now();

      const { room, result: rotatedHost } = await this.store.transact(roomId, (draft) => {
        if (options.expectedVersion !== undefined && options.expectedVersion !== draft.version) {
          throw new EngineError('VERSION_CONFLICT', { expected: options.expectedVersion, actual: draft.version });
        }
        const previousHost = draft.hostPlayerId;
        applyAction(draft, actor, action, { now, rng, actionId: options.actionId });
        if (draft.hostPlayerId !== previousHost) {
          const token = generateToken();
          draft.hostTokenHash = hashToken(token);
          return { playerId: draft.hostPlayerId, token };
        }
        return null;
      });

      if (rotatedHost) {
        this.hostGrants.set(`${roomId}:${rotatedHost.playerId}`, {
          playerId: rotatedHost.playerId,
          token: rotatedHost.token,
          createdAt: now,
        });
      }

      if (room.status === 'DISSOLVED') {
        // 保留一小段时间让所有客户端收到解散广播，随后由 sweep 回收
        setTimeout(() => {
          void this.store.remove(roomId);
        }, 15_000).unref?.();
      }

      return this.envelope(room, actor.playerId);
    } catch (error) {
      throw toServiceError(error);
    }
  }

  /* --------------------------- 席位恢复 --------------------------- */

  async requestSeatClaim(
    roomCode: string,
    targetPlayerId: string,
  ): Promise<{ claimId: string; playerId: string; playerToken: string; roomId: string }> {
    try {
      const existing = await this.requireRoomByCode(roomCode);
      const claimId = generateId();
      const playerToken = generateToken();
      await this.store.transact(existing.id, (draft) => {
        this.assertUsable(draft);
        requestSeatClaimEntity(draft, {
          claimId,
          targetPlayerId,
          newTokenHash: hashToken(playerToken),
          now: Date.now(),
        });
      });
      return { claimId, playerId: targetPlayerId, playerToken, roomId: existing.id };
    } catch (error) {
      throw toServiceError(error);
    }
  }

  async getSeatClaim(roomCode: string, claimId: string): Promise<{ status: string }> {
    const room = await this.requireRoomByCode(roomCode);
    const claim = room.seatClaims.find((c) => c.id === claimId);
    if (!claim) throw new ServiceError('CLAIM_NOT_FOUND', 404);
    return { status: claim.status };
  }

  /* --------------------------- 在线状态 --------------------------- */

  async setOnline(roomId: string, playerId: string, online: boolean): Promise<void> {
    try {
      await this.store.transact(roomId, (draft) => {
        setPlayerOnline(draft, playerId, online, Date.now());
      });
    } catch {
      // 房间可能已解散，忽略
    }
  }

  /* ------------------------------ 内部 ------------------------------ */

  private envelope(room: Room, playerId: string | null): ViewEnvelope {
    const view = computePlayerView(room, playerId, Date.now());
    const key = playerId ? `${room.id}:${playerId}` : null;
    if (key && this.hostGrants.has(key)) {
      const grant = this.hostGrants.get(key)!;
      this.hostGrants.delete(key);
      return { view, grantedHostToken: grant.token };
    }
    return { view };
  }

  /**
   * 鉴权：
   * - playerId + playerToken 必须匹配该房间中的玩家哈希
   * - hostVerified 只有在 hostToken 匹配且 playerId 就是当前房主时才为真
   *
   * 房间码不是任何权限凭证；改 localStorage 也无法得到 hostVerified。
   */
  authorize(room: Room, auth: AuthInput): Actor {
    if (!auth.playerId) {
      return { playerId: null, hostVerified: false };
    }
    const player = findPlayer(room, auth.playerId);
    if (!player) throw new ServiceError('PLAYER_NOT_FOUND', 404);
    if (!verifyToken(auth.playerToken ?? null, player.reconnectTokenHash)) {
      throw new ServiceError('INVALID_CREDENTIALS', 401);
    }
    const hostVerified =
      room.hostPlayerId === player.id && verifyToken(auth.hostToken ?? null, room.hostTokenHash);
    return { playerId: player.id, hostVerified };
  }

  private assertUsable(room: Room): void {
    if (room.status === 'DISSOLVED') throw new ServiceError('ROOM_DISSOLVED', 410);
    if (room.expiresAt < Date.now()) throw new ServiceError('ROOM_EXPIRED', 410);
  }

  private async requireRoomById(roomId: string): Promise<Room> {
    const room = await this.store.getById(roomId);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 404);
    return room;
  }

  private async requireRoomByCode(roomCode: string): Promise<Room> {
    const room = await this.store.getByCode((roomCode ?? '').trim().toUpperCase());
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 404);
    return room;
  }
}
