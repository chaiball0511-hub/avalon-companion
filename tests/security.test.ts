import { describe, it, expect } from 'vitest';
import { hashToken, verifyToken } from '../server/security';

describe('令牌哈希与校验', () => {
  it('相同令牌的哈希一致，且验证通过', () => {
    const token = 's3cr3t-token-value';
    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(verifyToken(token, hash)).toBe(true);
  });

  it('不同令牌验证失败', () => {
    const hash = hashToken('correct');
    expect(verifyToken('wrong', hash)).toBe(false);
  });

  it('空令牌或错误哈希安全返回 false', () => {
    expect(verifyToken(null, hashToken('x'))).toBe(false);
    expect(verifyToken('x', null)).toBe(false);
    expect(verifyToken('x', 'not-a-hex')).toBe(false);
  });

  it('恒定时间比较对长度不同的哈希返回 false，不抛异常', () => {
    expect(verifyToken('abc', '00')).toBe(false);
  });
});
