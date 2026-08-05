import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/constants';

/** 不可猜测的会话令牌（明文只交给对应设备，服务端只留哈希） */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateId(): string {
  return randomUUID();
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 恒定时间比较，避免通过响应时间侧信道爆破令牌 */
export function verifyToken(token: string | undefined | null, expectedHash: string | undefined | null): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashToken(token), 'hex');
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, 'hex');
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** 6 位易输入房间码，去掉 0/O/1/I 等易混字符 */
export function generateRoomCode(): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH * 2);
  let code = '';
  for (let i = 0; code.length < ROOM_CODE_LENGTH && i < bytes.length; i += 1) {
    const index = bytes[i]! % ROOM_CODE_ALPHABET.length;
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}
