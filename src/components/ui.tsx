import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useT } from '../i18n';

/* ------------------------------ 基础 ------------------------------ */

export function Screen({ children }: { children: ReactNode }) {
  return <div className="screen">{children}</div>;
}

export function Header({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const t = useT();
  return (
    <header className="screen-header">
      {onBack && (
        <button
          type="button"
          className="btn ghost small"
          onClick={onBack}
          aria-label={t('common.back')}
          style={{ minHeight: 34, padding: '4px 10px' }}
        >
          ‹ {t('common.back')}
        </button>
      )}
      <span className="title">{title}</span>
      {right}
    </header>
  );
}

export function Body({ children, withNav }: { children: ReactNode; withNav?: boolean }) {
  return <main className={`screen-body${withNav ? ' with-nav' : ''}`}>{children}</main>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'good' | 'evil';
  size?: 'default' | 'small';
};

export function Button({ variant = 'default', size = 'default', className, ...rest }: ButtonProps) {
  const classes = ['btn'];
  if (variant !== 'default') classes.push(variant);
  if (size === 'small') classes.push('small');
  if (className) classes.push(className);
  return <button type="button" className={classes.join(' ')} {...rest} />;
}

export function Card({
  title,
  children,
  right,
  tight,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  tight?: boolean;
}) {
  return (
    <section className={`card${tight ? ' tight' : ''}`}>
      {title && (
        <h2 className="card-title">
          <span>{title}</span>
          {right}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Banner({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warn' | 'error' | 'test';
  children: ReactNode;
}) {
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <span>{children}</span>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className="switch"
      data-on={checked}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Spinner() {
  return <div className="spinner" aria-hidden />;
}

export function Tag({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'gold' | 'good' | 'evil' | 'off';
}) {
  return <span className={`tag${tone === 'default' ? '' : ` ${tone}`}`}>{children}</span>;
}

/* ------------------------------ 确认弹窗 ------------------------------ */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => setState({ options, resolve }));
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state && (
        <div className="overlay" role="dialog" aria-modal="true" onClick={() => close(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h3>{state.options.title}</h3>
            {state.options.message && <p className="muted">{state.options.message}</p>}
            <div className="btn-row">
              <Button variant="ghost" onClick={() => close(false)}>
                {state.options.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button variant={state.options.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {state.options.confirmLabel ?? t('common.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

/* ------------------------------ 底部弹层 ------------------------------ */

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
