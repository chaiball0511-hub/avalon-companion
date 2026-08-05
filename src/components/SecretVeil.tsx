import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Button } from './ui';

/**
 * 秘密信息遮罩。
 *
 * - 默认遮盖，必须「按住」才显示，松手立即遮盖
 * - 提供「点击查看 / 点击隐藏」的无障碍备用方式
 * - 页面进入后台、失去焦点、锁屏时自动遮盖
 */
export function SecretVeil({
  coverTitle,
  coverHint,
  holdLabel,
  children,
  onFirstReveal,
}: {
  coverTitle: string;
  coverHint?: string;
  holdLabel?: string;
  children: ReactNode;
  onFirstReveal?: () => void;
}) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const [autoHidden, setAutoHidden] = useState(false);
  const [holding, setHolding] = useState(false);
  const seenRef = useRef(false);

  const hide = useCallback((auto: boolean) => {
    setRevealed(false);
    setHolding(false);
    if (auto) setAutoHidden(true);
  }, []);

  const show = useCallback(() => {
    setAutoHidden(false);
    setRevealed(true);
    if (!seenRef.current) {
      seenRef.current = true;
      onFirstReveal?.();
    }
  }, [onFirstReveal]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') hide(true);
    };
    const onBlur = () => hide(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onBlur);
    };
  }, [hide]);

  return (
    <div>
      <div className="identity-shroud">
        {revealed ? (
          <div className="identity-content">{children}</div>
        ) : (
          <div className="identity-cover">
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--gold-dim)" strokeWidth="1.3">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 018 0v3" />
            </svg>
            <strong style={{ color: 'var(--text-dim)' }}>{coverTitle}</strong>
            {coverHint && <span className="faint">{coverHint}</span>}
            {autoHidden && <span className="faint">{t('reveal.autoHidden')}</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <Button
          variant="primary"
          className="hold-btn"
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setHolding(true);
            show();
          }}
          onPointerUp={() => hide(false)}
          onPointerCancel={() => hide(false)}
          onPointerLeave={() => holding && hide(false)}
        >
          {holding ? (holdLabel ?? t('reveal.holding')) : t('reveal.hold')}
        </Button>
        <Button variant="ghost" onClick={() => (revealed ? hide(false) : show())}>
          {revealed ? t('reveal.tapHide') : t('reveal.tapShow')}
        </Button>
        <span className="faint" style={{ textAlign: 'center' }}>
          {t('reveal.a11yHint')}
        </span>
      </div>
    </div>
  );
}
