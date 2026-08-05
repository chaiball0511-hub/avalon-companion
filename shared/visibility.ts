import type { KnownLabel, Role, SecretAssignment } from './types';
import { ROLE_META, ROLE_NOTE_KEYS, alignmentOf } from './roles';
import { shuffle, type Rng } from './random';

export interface RoleSlot {
  playerId: string;
  role: Role;
}

/**
 * 计算某个角色应当获知的其他玩家。
 *
 * 规则：
 * - 梅林：看到除莫德雷德以外的全部坏人（含奥伯伦），但不知道各自具体角色
 * - 派西维尔：看到梅林与莫甘娜（若莫甘娜在场），顺序随机且不标注真假
 * - 忠臣：无额外信息
 * - 坏人（刺客/莫甘娜/莫德雷德/爪牙）：互相可见，但看不到奥伯伦
 * - 奥伯伦：看不到任何队友，其他坏人也看不到他
 */
export function computeKnownPlayerIds(
  self: RoleSlot,
  slots: readonly RoleSlot[],
): { label: KnownLabel | null; playerIds: string[] } {
  const others = slots.filter((s) => s.playerId !== self.playerId);

  switch (self.role) {
    case 'MERLIN': {
      const ids = others
        .filter((s) => alignmentOf(s.role) === 'EVIL' && s.role !== 'MORDRED')
        .map((s) => s.playerId);
      return { label: 'EVIL_SENSED', playerIds: ids };
    }
    case 'PERCIVAL': {
      const ids = others
        .filter((s) => s.role === 'MERLIN' || s.role === 'MORGANA')
        .map((s) => s.playerId);
      return { label: 'MERLIN_CANDIDATES', playerIds: ids };
    }
    case 'ASSASSIN':
    case 'MORGANA':
    case 'MORDRED':
    case 'MINION': {
      const ids = others
        .filter((s) => alignmentOf(s.role) === 'EVIL' && s.role !== 'OBERON')
        .map((s) => s.playerId);
      return { label: 'EVIL_TEAMMATES', playerIds: ids };
    }
    case 'OBERON':
    case 'LOYAL_SERVANT':
    default:
      return { label: null, playerIds: [] };
  }
}

/**
 * 发牌：把角色表随机分配给玩家，并把每人的秘密信息一次性固化。
 * knownPlayerIds 在此刻打乱，确保刷新页面不会改变顺序（顺序变化会泄露信息）。
 */
export function dealAssignments(
  playerIds: readonly string[],
  roles: readonly Role[],
  rng: Rng,
): SecretAssignment[] {
  if (playerIds.length !== roles.length) {
    throw new Error('ROLE_COUNT_MISMATCH');
  }
  const shuffledRoles = shuffle(roles, rng);
  const slots: RoleSlot[] = playerIds.map((playerId, index) => ({
    playerId,
    role: shuffledRoles[index]!,
  }));

  return slots.map((slot) => {
    const known = computeKnownPlayerIds(slot, slots);
    return {
      playerId: slot.playerId,
      role: slot.role,
      alignment: ROLE_META[slot.role].alignment,
      knownPlayerIds: shuffle(known.playerIds, rng),
      knownLabel: known.playerIds.length > 0 ? known.label : null,
    };
  });
}

export function noteKeysFor(role: Role): string[] {
  return ROLE_NOTE_KEYS[role];
}
