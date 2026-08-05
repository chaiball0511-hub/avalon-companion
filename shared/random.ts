/**
 * 随机源抽象。
 *
 * - 正式对局使用 Web Crypto（Node 19+ 与所有现代浏览器均提供 globalThis.crypto）。
 * - 单人测试模式可传入固定种子，便于复现场景。
 *
 * 不使用 Math.random 作为发牌的唯一随机源。
 */

export interface Rng {
  readonly kind: 'secure' | 'seeded';
  nextUint32(): number;
}

export function createSecureRng(): Rng {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('SECURE_RANDOM_UNAVAILABLE');
  }
  return {
    kind: 'secure',
    nextUint32() {
      const buf = new Uint32Array(1);
      cryptoObj.getRandomValues(buf);
      return buf[0]! >>> 0;
    },
  };
}

/** mulberry32：仅用于测试模式的可复现随机 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    kind: 'seeded',
    nextUint32() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) as number;
    },
  };
}

/** 无偏取模：拒绝落在不完整区间的采样 */
export function randomBelow(rng: Rng, bound: number): number {
  if (bound <= 0) throw new Error('BOUND_MUST_BE_POSITIVE');
  if (bound === 1) return 0;
  const limit = Math.floor(0x100000000 / bound) * bound;
  // 极小概率重采样；上限保护避免测试用 RNG 退化时死循环
  for (let i = 0; i < 1000; i += 1) {
    const value = rng.nextUint32();
    if (value < limit) return value % bound;
  }
  return rng.nextUint32() % bound;
}

/** Fisher-Yates，返回新数组 */
export function shuffle<T>(input: readonly T[], rng: Rng): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomBelow(rng, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
