import { describe, it, expect } from 'vitest';
import {
  createRoom,
  addPlayer,
  applyAction,
  computePlayerView,
  type Actor,
} from '@shared/engine';
import { createSeededRng } from '@shared/random';
import {
  DEFAULT_ROLE_CONFIG,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COUNT_TABLE,
  buildRoleComposition,
} from '@shared/roles';
import type { Role, RoleConfig, Room } from '@shared/types';

function makeRoom(playerCount: number, seed = 1, config: RoleConfig = DEFAULT_ROLE_CONFIG): Room {
  const rng = createSeededRng(seed);
  const now = 1000;
  const room = createRoom({
    roomId: 'r',
    roomCode: 'TEST01',
    hostPlayerId: 'p1',
    hostNickname: 'P1',
    hostTokenHash: 'h',
    playerTokenHash: 'h',
    now,
    roleConfig: { ...config },
  });
  for (let i = 2; i <= playerCount; i += 1) {
    addPlayer(room, { playerId: `p${i}`, nickname: `P${i}`, tokenHash: 'h', now });
  }
  room.firstLeaderPlayerId = room.playerOrder[0]!;
  applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'START_GAME' }, { now, rng });
  confirmEveryone(room);
  return room;
}

/** 全员确认身份，进入游戏阶段（用于流程类测试的前置） */
function confirmEveryone(room: Room): void {
  const rng = createSeededRng(1);
  for (const id of room.playerOrder) {
    applyAction(room, { playerId: id, hostVerified: false }, { type: 'CONFIRM_ROLE' }, { now: 2000, rng });
  }
}

function roleOf(room: Room, playerId: string): Role {
  const a = room.assignments.find((x) => x.playerId === playerId);
  if (!a) throw new Error(`no assignment for ${playerId}`);
  return a.role;
}

function playersWithRole(room: Room, role: Role): string[] {
  return room.assignments.filter((a) => a.role === role).map((a) => a.playerId);
}

describe('角色人数表', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n += 1) {
    it(`${n} 人局的角色表长度等于玩家数，且阵营人数正确`, () => {
      const composition = buildRoleComposition(n, DEFAULT_ROLE_CONFIG);
      expect(composition.valid).toBe(true);
      expect(composition.roles.length).toBe(n);
      expect(composition.goodSlots).toBe(PLAYER_COUNT_TABLE[n].good);
      expect(composition.evilSlots).toBe(PLAYER_COUNT_TABLE[n].evil);
      expect(composition.goodSlots + composition.evilSlots).toBe(n);
    });
  }

  it('7 人开启湖上夫人但没指定队长时无法开始', () => {
    const lobby = createLobby(7, { ...DEFAULT_ROLE_CONFIG, ladyOfTheLake: true });
    lobby.firstLeaderPlayerId = null;
    const rng = createSeededRng(7);
    expect(() =>
      applyAction(lobby, { playerId: 'p1', hostVerified: true }, { type: 'START_GAME' }, { now: 2000, rng }),
    ).toThrow();
  });
});

function createLobby(playerCount: number, config: RoleConfig): Room {
  const now = 1000;
  const room = createRoom({
    roomId: 'r',
    roomCode: 'TEST01',
    hostPlayerId: 'p1',
    hostNickname: 'P1',
    hostTokenHash: 'h',
    playerTokenHash: 'h',
    now,
    roleConfig: { ...config },
  });
  for (let i = 2; i <= playerCount; i += 1) {
    addPlayer(room, { playerId: `p${i}`, nickname: `P${i}`, tokenHash: 'h', now });
  }
  return room;
}

describe('发牌与身份隔离', () => {
  it('游戏中完整身份表不下发，且个人身份正确', () => {
    const room = makeRoom(7, 42);
    expect(room.status).toBe('IN_GAME');
    const view = computePlayerView(room, 'p1');
    expect(view.fullReveal).toBeNull();
    expect(view.identity?.role).toBe(roleOf(room, 'p1'));
  });

  it('梅林看到除莫德雷德之外的全部坏人', () => {
    const room = makeRoom(7, 42, {
      percival: true,
      morgana: true,
      mordred: true,
      oberon: false,
      ladyOfTheLake: false,
    });
    const merlin = playersWithRole(room, 'MERLIN')[0]!;
    const view = computePlayerView(room, merlin);
    const knownRoles = view.identity!.knownPlayers.map((p) => roleOf(room, p.id));
    expect(view.identity!.knownLabel).toBe('EVIL_SENSED');
    expect(new Set(knownRoles)).toEqual(new Set(['ASSASSIN', 'MORGANA']));
  });

  it('派西维尔只看到「梅林 / 莫甘娜」两位候选人', () => {
    const room = makeRoom(7, 42, {
      percival: true,
      morgana: true,
      mordred: true,
      oberon: false,
      ladyOfTheLake: false,
    });
    const percival = playersWithRole(room, 'PERCIVAL')[0]!;
    const view = computePlayerView(room, percival);
    const knownRoles = view.identity!.knownPlayers.map((p) => roleOf(room, p.id));
    expect(view.identity!.knownLabel).toBe('MERLIN_CANDIDATES');
    expect(new Set(knownRoles)).toEqual(new Set(['MERLIN', 'MORGANA']));
  });

  it('坏人互相可见，但都看不到奥伯伦', () => {
    const room = makeRoom(10, 99, {
      percival: true,
      morgana: true,
      mordred: true,
      oberon: true,
      ladyOfTheLake: false,
    });
    const assassin = playersWithRole(room, 'ASSASSIN')[0]!;
    const oberon = playersWithRole(room, 'OBERON')[0]!;
    const view = computePlayerView(room, assassin);
    const knownRoles = view.identity!.knownPlayers.map((p) => roleOf(room, p.id));
    expect(view.identity!.knownLabel).toBe('EVIL_TEAMMATES');
    expect(knownRoles).toContain('MORGANA');
    expect(knownRoles).toContain('MORDRED');
    expect(knownRoles).not.toContain('OBERON');
    expect(view.identity!.knownPlayers.map((p) => p.id)).not.toContain(oberon);
  });

  it('奥伯伦与忠臣没有任何额外信息', () => {
    const room = makeRoom(10, 99, {
      percival: true,
      morgana: true,
      mordred: true,
      oberon: true,
      ladyOfTheLake: false,
    });
    const oberon = playersWithRole(room, 'OBERON')[0]!;
    const loyal = playersWithRole(room, 'LOYAL_SERVANT')[0]!;
    expect(computePlayerView(room, oberon).identity!.knownPlayers.length).toBe(0);
    expect(computePlayerView(room, loyal).identity!.knownPlayers.length).toBe(0);
  });
});

describe('对局流程', () => {
  it('全员确认身份后进入游戏', () => {
    const room = createLobby(5, DEFAULT_ROLE_CONFIG);
    room.firstLeaderPlayerId = room.playerOrder[0]!;
    applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'START_GAME' }, { now: 1000, rng: createSeededRng(11) });
    expect(room.status).toBe('ROLE_REVEAL');
    confirmEveryone(room);
    expect(room.status).toBe('IN_GAME');
  });

  it('坏人三次破坏即获胜', () => {
    const room = makeRoom(5, 11);
    const rng = createSeededRng(11);
    for (let i = 0; i < 3; i += 1) {
      applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'RECORD_QUEST', result: 'FAIL' }, { now: 2000, rng });
    }
    expect(room.status).toBe('GAME_OVER');
    expect(room.winner).toBe('EVIL');
    expect(room.endReason).toBe('EVIL_THREE_FAILS');
  });

  it('好人三次成功后进入刺杀，刺中梅林则坏人胜', () => {
    const room = makeRoom(5, 11);
    const rng = createSeededRng(11);
    for (let i = 0; i < 3; i += 1) {
      applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'RECORD_QUEST', result: 'SUCCESS' }, { now: 2000, rng });
    }
    expect(room.status).toBe('ASSASSINATION');
    const assassin = playersWithRole(room, 'ASSASSIN')[0]!;
    const merlin = playersWithRole(room, 'MERLIN')[0]!;
    applyAction(room, { playerId: assassin, hostVerified: false }, { type: 'SUBMIT_ASSASSINATION', targetPlayerId: merlin }, { now: 3000, rng });
    expect(room.status).toBe('GAME_OVER');
    expect(room.winner).toBe('EVIL');
    expect(room.endReason).toBe('ASSASSIN_HIT');
    // 终局才公开完整身份
    expect(computePlayerView(room, 'p1').fullReveal).not.toBeNull();
  });

  it('刺杀失误则好人胜，且只有刺客能提交刺杀', () => {
    const room = makeRoom(5, 11);
    const rng = createSeededRng(11);
    for (let i = 0; i < 3; i += 1) {
      applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'RECORD_QUEST', result: 'SUCCESS' }, { now: 2000, rng });
    }
    const assassin = playersWithRole(room, 'ASSASSIN')[0]!;
    const loyal = playersWithRole(room, 'LOYAL_SERVANT')[0]!;
    expect(() =>
      applyAction(room, { playerId: loyal, hostVerified: false }, { type: 'SUBMIT_ASSASSINATION', targetPlayerId: 'p1' }, { now: 3000, rng }),
    ).toThrow();
    applyAction(room, { playerId: assassin, hostVerified: false }, { type: 'SUBMIT_ASSASSINATION', targetPlayerId: loyal }, { now: 3000, rng });
    expect(room.winner).toBe('GOOD');
    expect(room.endReason).toBe('ASSASSIN_MISS');
  });
});

describe('湖上夫人', () => {
  it('第 2 次任务后触发，由首任队长右侧玩家持有', () => {
    const room = makeRoom(7, 7, { ...DEFAULT_ROLE_CONFIG, ladyOfTheLake: true });
    const rng = createSeededRng(7);
    const order = room.playerOrder.slice();
    const leaderIdx = order.indexOf(room.firstLeaderPlayerId!);
    const holder = order[(leaderIdx + 1) % order.length]!;
    // 两次成功任务
    applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'RECORD_QUEST', result: 'SUCCESS' }, { now: 2000, rng });
    applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'RECORD_QUEST', result: 'SUCCESS' }, { now: 2000, rng });
    expect(room.status).toBe('LADY_OF_THE_LAKE');
    expect(room.lady.currentHolderPlayerId).toBe(holder);
    // 持有者查看一位目标
    const target = order.find((id) => id !== holder)!;
    applyAction(room, { playerId: holder, hostVerified: false }, { type: 'LADY_SELECT_TARGET', targetPlayerId: target }, { now: 3000, rng });
    applyAction(room, { playerId: holder, hostVerified: false }, { type: 'LADY_ACKNOWLEDGE' }, { now: 3000, rng });
    expect(room.status).toBe('IN_GAME');
    expect(room.lady.currentHolderPlayerId).toBe(target);
    expect(room.lady.useCount).toBe(1);
  });
});

describe('权限与安全性', () => {
  it('非房主无法执行房主专属操作', () => {
    const room = createRoom({
      roomId: 'r',
      roomCode: 'TEST01',
      hostPlayerId: 'p1',
      hostNickname: 'P1',
      hostTokenHash: 'h',
      playerTokenHash: 'h',
      now: 1000,
      roleConfig: { ...DEFAULT_ROLE_CONFIG },
    });
    addPlayer(room, { playerId: 'p2', nickname: 'P2', tokenHash: 'h', now: 1000 });
    const nonHost: Actor = { playerId: 'p2', hostVerified: false };
    expect(() => applyAction(room, nonHost, { type: 'OPEN_ROLE_CONFIG' }, { now: 1000, rng: createSeededRng(1) })).toThrow();
  });

  it('hostVerified 为 false 时即使声称房主也无法越权', () => {
    const room = makeRoom(5, 11);
    const fakeHost: Actor = { playerId: 'p1', hostVerified: false };
    // p1 确实是房主，但未经验证（hostVerified=false），不应允许房主操作
    expect(() => applyAction(room, fakeHost, { type: 'REMOVE_PLAYER', playerId: 'p2' }, { now: 2000, rng: createSeededRng(1) })).toThrow();
  });

  it('刺杀候选包含奥伯伦（不会被阵营过滤泄露其为坏人）', () => {
    const room = makeRoom(10, 99, {
      percival: true,
      morgana: true,
      mordred: true,
      oberon: true,
      ladyOfTheLake: false,
    });
    const rng = createSeededRng(99);
    for (let i = 0; i < 3; i += 1) {
      applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'RECORD_QUEST', result: 'SUCCESS' }, { now: 5000, rng });
    }
    expect(room.status).toBe('ASSASSINATION');
    const assassin = playersWithRole(room, 'ASSASSIN')[0]!;
    const oberon = playersWithRole(room, 'OBERON')[0]!;
    const view = computePlayerView(room, assassin);
    expect(view.assassinPrompt).not.toBeNull();
    const candidateIds = view.assassinPrompt!.candidates.map((c) => c.id);
    expect(candidateIds).toContain(oberon);
    expect(candidateIds).not.toContain(assassin);
  });

  it('不能选择自己作为刺杀目标', () => {
    const room = makeRoom(5, 11);
    const rng = createSeededRng(11);
    for (let i = 0; i < 3; i += 1) {
      applyAction(room, { playerId: 'p1', hostVerified: true }, { type: 'RECORD_QUEST', result: 'SUCCESS' }, { now: 2000, rng });
    }
    const assassin = playersWithRole(room, 'ASSASSIN')[0]!;
    expect(() =>
      applyAction(room, { playerId: assassin, hostVerified: false }, { type: 'SUBMIT_ASSASSINATION', targetPlayerId: assassin }, { now: 3000, rng }),
    ).toThrow();
  });
});
