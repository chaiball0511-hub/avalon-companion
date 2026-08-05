import type { Role } from '@shared/types';

/**
 * 原创纹章图形（纯几何 SVG）。
 * 不使用任何官方桌游美术素材。
 */

const GLYPHS: Record<Role, JSX.Element> = {
  MERLIN: (
    <g>
      <circle cx="24" cy="23" r="7.5" fill="none" strokeWidth="1.6" />
      <circle cx="24" cy="23" r="2.4" />
      <path d="M24 10.5v-4M24 39.5v4M11.5 23h-4M40.5 23h4M15 14l-2.6-2.6M33 14l2.6-2.6" strokeWidth="1.6" />
    </g>
  ),
  PERCIVAL: (
    <g fill="none" strokeWidth="1.6">
      <circle cx="19" cy="23" r="7" />
      <circle cx="29" cy="23" r="7" />
    </g>
  ),
  LOYAL_SERVANT: (
    <g fill="none" strokeWidth="1.7">
      <path d="M24 12l10 4v8c0 6.5-4.4 11.5-10 13.5C18.4 35.5 14 30.5 14 24v-8z" />
    </g>
  ),
  ASSASSIN: (
    <g strokeWidth="1.7" fill="none">
      <path d="M24 10l3.4 17L24 38l-3.4-11z" />
      <path d="M17.5 27h13" />
    </g>
  ),
  MORGANA: (
    <g strokeWidth="1.6" fill="none">
      <path d="M31.5 15.5a10 10 0 100 15 8.6 8.6 0 010-15z" />
      <path d="M20 19.5h4M20 26.5h4" />
    </g>
  ),
  MORDRED: (
    <g strokeWidth="1.6" fill="none">
      <path d="M14 30l-1.5-13 6.5 5.5L24 14l5 8.5 6.5-5.5L34 30z" />
      <path d="M13 34.5h22" />
    </g>
  ),
  OBERON: (
    <g strokeWidth="1.6" fill="none">
      <circle cx="24" cy="23" r="8" strokeDasharray="3.5 3.5" />
      <circle cx="24" cy="23" r="2" />
    </g>
  ),
  MINION: (
    <g strokeWidth="1.7" fill="none">
      <path d="M16 18l8 5 8-5M16 24.5l8 5 8-5M16 31l8 5 8-5" />
    </g>
  ),
};

export function Crest({ role, size = 66 }: { role: Role; size?: number }) {
  const evil = role === 'ASSASSIN' || role === 'MORGANA' || role === 'MORDRED' || role === 'OBERON' || role === 'MINION';
  const stroke = evil ? 'var(--evil)' : 'var(--good)';
  return (
    <svg
      className="crest"
      width={size}
      height={size}
      viewBox="0 0 48 52"
      role="img"
      aria-hidden
      style={{ color: stroke }}
    >
      <path
        d="M24 2l20 7v18c0 12-8.4 20.6-20 23C12.4 47.6 4 39 4 27V9z"
        fill="none"
        stroke="var(--gold-dim)"
        strokeWidth="1.4"
      />
      <g stroke={stroke} fill={stroke} strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[role]}
      </g>
    </svg>
  );
}

export function BrandCrest({ size = 76 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.08} viewBox="0 0 48 52" role="img" aria-hidden>
      <defs>
        <linearGradient id="brand-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--gold-dim)" />
        </linearGradient>
      </defs>
      <path
        d="M24 2l20 7v18c0 12-8.4 20.6-20 23C12.4 47.6 4 39 4 27V9z"
        fill="none"
        stroke="url(#brand-gold)"
        strokeWidth="1.6"
      />
      <g stroke="url(#brand-gold)" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M24 12v22" />
        <path d="M17 18h14" />
        <path d="M20 34h8" />
        <circle cx="24" cy="9.5" r="2.2" />
      </g>
    </svg>
  );
}
