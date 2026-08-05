import type { Action } from '@shared/engine';
import type { PlayerView, RoomStatus } from '@shared/types';

export class ApiError extends Error {
  readonly code: string;
  readonly params: Record<string, string | number> | null;
  readonly status: number;

  constructor(code: string, status: number, params: Record<string, string | number> | null = null) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.params = params;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('NETWORK', 0);
  }
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok) {
    const err = (payload as { error?: { code?: string; params?: Record<string, string | number> } }).error;
    throw new ApiError(err?.code ?? 'INTERNAL_ERROR', response.status, err?.params ?? null);
  }
  return payload as T;
}

export interface CreateRoomResponse {
  roomId: string;
  roomCode: string;
  playerId: string;
  playerToken: string;
  hostToken: string;
  view: PlayerView;
}

export interface JoinRoomResponse {
  roomId: string;
  roomCode: string;
  playerId: string;
  playerToken: string;
  view: PlayerView;
}

export interface RoomSummary {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  canJoin: boolean;
  players: { id: string; nickname: string; online: boolean; hasLeft: boolean }[];
}

export interface ViewEnvelope {
  view: PlayerView;
  grantedHostToken?: string;
}

export interface Credentials {
  playerId: string;
  playerToken: string;
  hostToken?: string;
}

export const api = {
  createRoom(nickname: string, deviceId: string) {
    return request<CreateRoomResponse>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ nickname, deviceId }),
    });
  },

  joinRoom(roomCode: string, nickname: string, deviceId: string) {
    return request<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname, deviceId }),
    });
  },

  summary(roomCode: string) {
    return request<RoomSummary>(`/api/rooms/${encodeURIComponent(roomCode)}/summary`);
  },

  view(roomId: string, creds: Credentials) {
    const query = new URLSearchParams({
      playerId: creds.playerId,
      playerToken: creds.playerToken,
      ...(creds.hostToken ? { hostToken: creds.hostToken } : {}),
    });
    return request<ViewEnvelope>(`/api/rooms/${roomId}/view?${query.toString()}`);
  },

  dispatch(
    roomId: string,
    creds: Credentials,
    action: Action,
    options: { expectedVersion?: number; actionId?: string } = {},
  ) {
    return request<ViewEnvelope>(`/api/rooms/${roomId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ ...creds, action, ...options }),
    });
  },

  requestSeatClaim(roomCode: string, targetPlayerId: string) {
    return request<{ claimId: string; playerId: string; playerToken: string; roomId: string }>(
      `/api/rooms/${encodeURIComponent(roomCode)}/seat-claims`,
      { method: 'POST', body: JSON.stringify({ targetPlayerId }) },
    );
  },

  seatClaimStatus(roomCode: string, claimId: string) {
    return request<{ status: 'PENDING' | 'APPROVED' | 'REJECTED' }>(
      `/api/rooms/${encodeURIComponent(roomCode)}/seat-claims/${claimId}`,
    );
  },
};
