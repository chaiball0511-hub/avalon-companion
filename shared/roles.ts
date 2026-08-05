import type { Alignment, Role, RoleConfig } from './types';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
export const LADY_MIN_PLAYERS = 7;
export const MAX_QUESTS = 5;
export const WIN_THRESHOLD = 3;
export const LADY_MAX_USES = 3;
/** 湖上夫人在第 2、3、4 次任务结束后使用 */
export const LADY_TRIGGER_QUESTS = [2, 3, 4] as const;

/** 官方阵营人数表 */
export const PLAYER_COUNT_TABLE: Record<number, { good: number; evil: number }> = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

export interface RoleMeta {
  alignment: Alignment;
  /** 是否唯一（最多一名） */
  unique: boolean;
  /** 是否为特殊角色（非填充角色） */
  special: boolean;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  MERLIN: { alignment: 'GOOD', unique: true, special: true },
  PERCIVAL: { alignment: 'GOOD', unique: true, special: true },
  LOYAL_SERVANT: { alignment: 'GOOD', unique: false, special: false },
  ASSASSIN: { alignment: 'EVIL', unique: true, special: true },
  MORGANA: { alignment: 'EVIL', unique: true, special: true },
  MORDRED: { alignment: 'EVIL', unique: true, special: true },
  OBERON: { alignment: 'EVIL', unique: true, special: true },
  MINION: { alignment: 'EVIL', unique: false, special: false },
};

export const DEFAULT_ROLE_CONFIG: RoleConfig = {
  percival: true,
  morgana: true,
  mordred: false,
  oberon: false,
  ladyOfTheLake: false,
};

export interface CompositionIssue {
  code: string;
  params?: Record<string, string | number>;
}

export interface RoleComposition {
  playerCount: number;
  goodSlots: number;
  evilSlots: number;
  goodSpecials: Role[];
  evilSpecials: Role[];
  loyalServantCount: number;
  minionCount: number;
  /** 最终角色列表（长度恒等于玩家数，配置非法时为空） */
  roles: Role[];
  errors: CompositionIssue[];
  warnings: CompositionIssue[];
  valid: boolean;
}

/**
 * 根据人数与房主配置推导最终角色表。
 *
 * 规则：
 * - 梅林 / 刺客 始终加入且不可关闭
 * - 特殊角色占用本阵营名额，不额外增加总人数
 * - 好人剩余名额补「忠臣」，坏人剩余名额补「莫德雷德的爪牙」
 */
export function buildRoleComposition(playerCount: number, config: RoleConfig): RoleComposition {
  const errors: CompositionIssue[] = [];
  const warnings: CompositionIssue[] = [];

  const table = PLAYER_COUNT_TABLE[playerCount];
  if (!table) {
    return {
      playerCount,
      goodSlots: 0,
      evilSlots: 0,
      goodSpecials: [],
      evilSpecials: [],
      loyalServantCount: 0,
      minionCount: 0,
      roles: [],
      errors: [{ code: 'PLAYER_COUNT_OUT_OF_RANGE', params: { min: MIN_PLAYERS, max: MAX_PLAYERS } }],
      warnings,
      valid: false,
    };
  }

  const goodSpecials: Role[] = ['MERLIN'];
  if (config.percival) goodSpecials.push('PERCIVAL');

  const evilSpecials: Role[] = ['ASSASSIN'];
  if (config.morgana) evilSpecials.push('MORGANA');
  if (config.mordred) evilSpecials.push('MORDRED');
  if (config.oberon) evilSpecials.push('OBERON');

  if (goodSpecials.length > table.good) {
    errors.push({
      code: 'GOOD_SPECIALS_EXCEED',
      params: { selected: goodSpecials.length, slots: table.good },
    });
  }
  if (evilSpecials.length > table.evil) {
    errors.push({
      code: 'EVIL_SPECIALS_EXCEED',
      params: { selected: evilSpecials.length, slots: table.evil },
    });
  }

  if (config.ladyOfTheLake && playerCount < LADY_MIN_PLAYERS) {
    errors.push({ code: 'LADY_REQUIRES_MIN_PLAYERS', params: { min: LADY_MIN_PLAYERS } });
  }

  // 规则 11：5 人局开启派西维尔却没有莫甘娜/莫德雷德时提醒但不阻止
  if (playerCount === 5 && config.percival && !config.morgana && !config.mordred) {
    warnings.push({ code: 'PERCIVAL_NEEDS_DISGUISE_5P' });
  }
  if (config.percival && !config.morgana) {
    warnings.push({ code: 'PERCIVAL_WITHOUT_MORGANA' });
  }
  if (!config.percival && config.morgana) {
    warnings.push({ code: 'MORGANA_WITHOUT_PERCIVAL' });
  }

  const loyalServantCount = Math.max(0, table.good - goodSpecials.length);
  const minionCount = Math.max(0, table.evil - evilSpecials.length);

  const valid = errors.length === 0;
  const roles: Role[] = valid
    ? [
        ...goodSpecials,
        ...Array.from({ length: loyalServantCount }, () => 'LOYAL_SERVANT' as Role),
        ...evilSpecials,
        ...Array.from({ length: minionCount }, () => 'MINION' as Role),
      ]
    : [];

  return {
    playerCount,
    goodSlots: table.good,
    evilSlots: table.evil,
    goodSpecials,
    evilSpecials,
    loyalServantCount,
    minionCount,
    roles,
    errors,
    warnings,
    valid,
  };
}

/** 角色说明文案的 i18n key（前端翻译，领域层不含展示文本） */
export const ROLE_NOTE_KEYS: Record<Role, string[]> = {
  MERLIN: ['role.MERLIN.note.win', 'role.MERLIN.note.sight', 'role.MERLIN.note.caution'],
  PERCIVAL: ['role.PERCIVAL.note.sight', 'role.PERCIVAL.note.caution'],
  LOYAL_SERVANT: ['role.LOYAL_SERVANT.note.blind'],
  ASSASSIN: ['role.ASSASSIN.note.duty', 'role.ASSASSIN.note.sight'],
  MORGANA: ['role.MORGANA.note.disguise', 'role.MORGANA.note.sight'],
  MORDRED: ['role.MORDRED.note.hidden', 'role.MORDRED.note.sight'],
  OBERON: ['role.OBERON.note.isolated', 'role.OBERON.note.visibleToMerlin'],
  MINION: ['role.MINION.note.sight'],
};

export function alignmentOf(role: Role): Alignment {
  return ROLE_META[role].alignment;
}
