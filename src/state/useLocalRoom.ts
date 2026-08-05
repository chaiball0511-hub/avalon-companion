import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EngineError,
  addPlayer,
  applyAction,
  computePlayerView,
  createRoom,
  setPlayerOnline,
  type Action,
  type Actor,
} from '@shared/engine';
import { DEFAULT_ROLE_CONFIG } from '@shared/roles';
import { createSecureRng, createSeededRng, type Rng } from '@shared/random';
import type { Role, RoleConfig, Room } from '@shared/types';
import type { ControllerError, RoomController } from './controller';

const TEST_STORAGE_KEY = 'avalon.testRoom';

export interface TestSetup {
  playerCount: number;
  config: RoleConfig;
  useSeed: boolean;
  seed: number;
}

export const DEFAULT_TEST_SETUP: TestSetup = {
  playerCount: 7,
  config: { ...DEFAULT_ROLE_CONFIG, mordred: true },
  useSeed: true,
  seed: 20260805,
};

export type ScenarioKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

interface Scenario {
  setup: TestSetup;
  /** 自动推进到目标节点，返回需要聚焦的玩家（用于信息隔离演示） */
  advance?: (room: Room, helpers: ScenarioHelpers) => string | void;
}

interface ScenarioHelpers {
  act: (room: Room, playerId: string, action: Action) => void;
  hostId: (room: Room) => string;
  confirmAll: (room: Room) => void;
  roleHolder: (room: Room, role: Role) => string | undefined;
  recordQuests: (room: Room, results: ('SUCCESS' | 'FAIL')[]) => void;
}

function baseConfig(overrides: Partial<RoleConfig> = {}): RoleConfig {
  return { ...DEFAULT_ROLE_CONFIG, ...overrides };
}

export const SCENARIOS: Record<ScenarioKey, Scenario> = {
  A: { setup: { playerCount: 5, config: baseConfig(), useSeed: true, seed: 1001 } },
  B: { setup: { playerCount: 7, config: baseConfig({ mordred: true }), useSeed: true, seed: 1002 } },
  C: {
    setup: { playerCount: 7, config: baseConfig({ mordred: true, ladyOfTheLake: true }), useSeed: true, seed: 1003 },
  },
  D: {
    setup: {
      playerCount: 10,
      config: baseConfig({ mordred: true, oberon: true, ladyOfTheLake: true }),
      useSeed: true,
      seed: 1004,
    },
  },
  E: {
    setup: { playerCount: 7, config: baseConfig({ mordred: true }), useSeed: true, seed: 1005 },
    advance: (room, h) => {
      h.confirmAll(room);
      h.recordQuests(room, ['SUCCESS', 'SUCCESS', 'SUCCESS']);
      const assassin = h.roleHolder(room, 'ASSASSIN');
      const merlin = h.roleHolder(room, 'MERLIN');
      if (assassin && merlin) {
        h.act(room, assassin, { type: 'SUBMIT_ASSASSINATION', targetPlayerId: merlin });
      }
      return assassin;
    },
  },
  F: {
    setup: { playerCount: 7, config: baseConfig({ mordred: true }), useSeed: true, seed: 1006 },
    advance: (room, h) => {
      h.confirmAll(room);
      h.recordQuests(room, ['SUCCESS', 'SUCCESS', 'SUCCESS']);
      const assassin = h.roleHolder(room, 'ASSASSIN');
      const decoy = room.assignments.find((a) => a.alignment === 'GOOD' && a.role !== 'MERLIN');
      if (assassin && decoy) {
        h.act(room, assassin, { type: 'SUBMIT_ASSASSINATION', targetPlayerId: decoy.playerId });
      }
      return assassin;
    },
  },
  G: {
    setup: { playerCount: 7, config: baseConfig({ mordred: true }), useSeed: true, seed: 1007 },
    advance: (room, h) => {
      h.confirmAll(room);
      h.recordQuests(room, ['FAIL', 'FAIL', 'FAIL']);
      return h.hostId(room);
    },
  },
  H: {
    setup: { playerCount: 10, config: baseConfig({ mordred: true, oberon: true }), useSeed: true, seed: 1008 },
    advance: (room, h) => {
      h.confirmAll(room);
      return h.roleHolder(room, 'OBERON');
    },
  },
  I: {
    setup: { playerCount: 7, config: baseConfig({ mordred: true }), useSeed: true, seed: 1009 },
    advance: (room, h) => {
      h.confirmAll(room);
      return h.roleHolder(room, 'MERLIN');
    },
  },
  J: {
    setup: { playerCount: 7, config: baseConfig({ mordred: true }), useSeed: true, seed: 1010 },
    advance: (room, h) => {
      h.confirmAll(room);
      return h.roleHolder(room, 'PERCIVAL');
    },
  },
};

function makeRng(setup: TestSetup): Rng {
  return setup.useSeed ? createSeededRng(setup.seed) : createSecureRng();
}

function buildRoom(setup: TestSetup): Room {
  const now = Date.now();
  const room = createRoom({
    roomId: 'test-room',
    roomCode: 'TEST01',
    hostPlayerId: 'p1',
    hostNickname: '玩家 1',
    hostTokenHash: 'test',
    playerTokenHash: 'test',
    now,
    roleConfig: { ...setup.config },
  });
  for (let i = 2; i <= setup.playerCount; i += 1) {
    addPlayer(room, { playerId: `p${i}`, nickname: `玩家 ${i}`, tokenHash: 'test', now });
  }
  room.firstLeaderPlayerId = room.playerOrder[0] ?? null;
  return room;
}

export interface LocalRoomController extends RoomController {
  room: Room | null;
  selectedPlayerId: string | null;
  selectPlayer: (playerId: string) => void;
  start: (setup: TestSetup) => void;
  reset: () => void;
  loadScenario: (key: ScenarioKey) => void;
  scenarioKey: ScenarioKey | null;
  confirmAll: () => void;
  toggleOffline: (playerId: string) => void;
  setup: TestSetup;
  setSetup: (setup: TestSetup) => void;
  debug: boolean;
  setDebug: (value: boolean) => void;
}

/** 单人测试模式控制器：完全本地，复用同一套引擎与页面 */
export function useLocalRoom(): LocalRoomController {
  const [room, setRoom] = useState<Room | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [setup, setSetup] = useState<TestSetup>(DEFAULT_TEST_SETUP);
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey | null>(null);
  const [error, setError] = useState<ControllerError | null>(null);
  const [debug, setDebug] = useState(false);
  const rngRef = useRef<Rng>(makeRng(DEFAULT_TEST_SETUP));
  const restored = useRef(false);

  /* 测试对局本地持久化：验证「返回首页后恢复」 */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(TEST_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { room: Room; selectedPlayerId: string; setup: TestSetup };
      if (parsed.room) {
        setRoom(parsed.room);
        setSelectedPlayerId(parsed.selectedPlayerId ?? parsed.room.playerOrder[0] ?? null);
        if (parsed.setup) setSetup(parsed.setup);
      }
    } catch {
      /* 忽略损坏数据 */
    }
  }, []);

  useEffect(() => {
    try {
      if (room) {
        localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify({ room, selectedPlayerId, setup }));
      } else {
        localStorage.removeItem(TEST_STORAGE_KEY);
      }
    } catch {
      /* 忽略 */
    }
  }, [room, selectedPlayerId, setup]);

  const mutate = useCallback((fn: (draft: Room) => void) => {
    setRoom((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      try {
        fn(draft);
      } catch (err) {
        if (err instanceof EngineError) setError({ code: err.code, params: err.params ?? null });
        else setError({ code: 'INTERNAL_ERROR', params: null });
        return current;
      }
      return draft;
    });
  }, []);

  const dispatch = useCallback(
    async (action: Action) => {
      setError(null);
      mutate((draft) => {
        const playerId = selectedPlayerId ?? draft.hostPlayerId;
        const actor: Actor = { playerId, hostVerified: playerId === draft.hostPlayerId };
        applyAction(draft, actor, action, { now: Date.now(), rng: rngRef.current });
      });
    },
    [mutate, selectedPlayerId],
  );

  const start = useCallback((nextSetup: TestSetup) => {
    setSetup(nextSetup);
    setScenarioKey(null);
    setError(null);
    rngRef.current = makeRng(nextSetup);
    const fresh = buildRoom(nextSetup);
    setRoom(fresh);
    setSelectedPlayerId(fresh.playerOrder[0] ?? null);
  }, []);

  const reset = useCallback(() => {
    setRoom(null);
    setSelectedPlayerId(null);
    setScenarioKey(null);
    setError(null);
    try {
      localStorage.removeItem(TEST_STORAGE_KEY);
    } catch {
      /* 忽略 */
    }
  }, []);

  const loadScenario = useCallback((key: ScenarioKey) => {
    const scenario = SCENARIOS[key];
    const rng = makeRng(scenario.setup);
    rngRef.current = rng;
    const draft = buildRoom(scenario.setup);
    const now = Date.now();

    const act = (target: Room, playerId: string, action: Action) => {
      applyAction(
        target,
        { playerId, hostVerified: playerId === target.hostPlayerId },
        action,
        { now, rng },
      );
    };

    // 所有场景都先完成发牌
    act(draft, draft.hostPlayerId, { type: 'START_GAME' });

    const helpers: ScenarioHelpers = {
      act,
      hostId: (target) => target.hostPlayerId,
      confirmAll: (target) => {
        target.playerOrder.forEach((id) => act(target, id, { type: 'CONFIRM_ROLE' }));
      },
      roleHolder: (target, role) => target.assignments.find((a) => a.role === role)?.playerId,
      recordQuests: (target, results) => {
        results.forEach((result) => {
          if (target.status === 'IN_GAME') act(target, target.hostPlayerId, { type: 'RECORD_QUEST', result });
        });
      },
    };

    const focus = scenario.advance?.(draft, helpers);
    setSetup(scenario.setup);
    setScenarioKey(key);
    setError(null);
    setRoom(draft);
    setSelectedPlayerId(typeof focus === 'string' ? focus : (draft.playerOrder[0] ?? null));
  }, []);

  const confirmAll = useCallback(() => {
    mutate((draft) => {
      draft.playerOrder.forEach((id) => {
        const player = draft.players.find((p) => p.id === id);
        if (!player || player.roleConfirmed) return;
        applyAction(
          draft,
          { playerId: id, hostVerified: id === draft.hostPlayerId },
          { type: 'CONFIRM_ROLE' },
          { now: Date.now(), rng: rngRef.current },
        );
      });
    });
  }, [mutate]);

  const toggleOffline = useCallback(
    (playerId: string) => {
      mutate((draft) => {
        const player = draft.players.find((p) => p.id === playerId);
        if (!player) return;
        setPlayerOnline(draft, playerId, !player.online, Date.now());
      });
    },
    [mutate],
  );

  const view = useMemo(
    () => (room && selectedPlayerId ? computePlayerView(room, selectedPlayerId, Date.now()) : null),
    [room, selectedPlayerId],
  );

  return {
    isTest: true,
    room,
    view,
    connection: room ? 'open' : 'closed',
    error,
    busy: false,
    dispatch,
    clearError: () => setError(null),
    refresh: () => undefined,
    selectedPlayerId,
    selectPlayer: setSelectedPlayerId,
    start,
    reset,
    loadScenario,
    scenarioKey,
    confirmAll,
    toggleOffline,
    setup,
    setSetup,
    debug,
    setDebug,
  };
}
