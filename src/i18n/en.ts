import type { TranslationKey } from './zh-CN';

/**
 * 英文文案（占位骨架）。
 * 缺失的 key 会自动回退到简体中文，方便逐步补齐翻译。
 */
export const en: Partial<Record<TranslationKey, string>> = {
  'app.name': 'Avalon Companion',
  'app.tagline': 'Identity & flow workbench for tabletop Avalon',
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.host': 'Host',
  'common.online': 'Online',
  'common.offline': 'Offline',
  'home.create': 'Create room',
  'home.join': 'Join room',
  'home.test': 'Solo test mode',
  'nav.game': 'Game',
  'nav.identity': 'Identity',
  'nav.players': 'Players',
  'nav.settings': 'Settings',
  'alignment.GOOD': 'Loyal servants of Arthur',
  'alignment.EVIL': 'Minions of Mordred',
  'role.MERLIN.name': 'Merlin',
  'role.PERCIVAL.name': 'Percival',
  'role.LOYAL_SERVANT.name': 'Loyal Servant',
  'role.ASSASSIN.name': 'Assassin',
  'role.MORGANA.name': 'Morgana',
  'role.MORDRED.name': 'Mordred',
  'role.OBERON.name': 'Oberon',
  'role.MINION.name': 'Minion of Mordred',
};
