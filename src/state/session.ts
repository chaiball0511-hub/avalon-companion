/**
 * 浏览器本地会话。
 *
 * 只保存匿名凭证，不含任何角色信息：
 * 即使用户手改 localStorage，也拿不到别人的身份或房主权限（服务端按哈希校验）。
 */

export interface StoredSession {
  roomId: string;
  roomCode: string;
  playerId: string;
  playerToken: string;
  hostToken?: string;
  nickname: string;
  updatedAt: number;
}

const SESSION_KEY = 'avalon.session';
const DEVICE_KEY = 'avalon.deviceId';
const NICKNAME_KEY = 'avalon.lastNickname';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式忽略 */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

export function getDeviceId(): string {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

export function loadSession(): StoredSession | null {
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.roomId || !parsed.playerId || !parsed.playerToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Omit<StoredSession, 'updatedAt'>): StoredSession {
  const next: StoredSession = { ...session, updatedAt: Date.now() };
  safeSet(SESSION_KEY, JSON.stringify(next));
  safeSet(NICKNAME_KEY, session.nickname);
  return next;
}

export function patchSession(patch: Partial<StoredSession>): StoredSession | null {
  const current = loadSession();
  if (!current) return null;
  const next: StoredSession = { ...current, ...patch, updatedAt: Date.now() };
  safeSet(SESSION_KEY, JSON.stringify(next));
  return next;
}

export function clearSession(): void {
  safeRemove(SESSION_KEY);
}

export function lastNickname(): string {
  return safeGet(NICKNAME_KEY) ?? '';
}

/** 主题偏好（默认深色） */
export type ThemeMode = 'dark' | 'light';
const THEME_KEY = 'avalon.theme';

export function loadTheme(): ThemeMode {
  return safeGet(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function saveTheme(mode: ThemeMode): void {
  safeSet(THEME_KEY, mode);
}
