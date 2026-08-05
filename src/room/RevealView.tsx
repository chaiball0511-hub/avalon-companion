import { useT } from '../i18n';
import { Banner, Button, Card } from '../components/ui';
import { SecretVeil } from '../components/SecretVeil';
import { PlayerList } from '../components/PlayerList';
import { IdentityCard } from './IdentityCard';
import type { ViewProps } from './types';

/** 发牌后的秘密查看阶段 */
export function RevealView({ view, dispatch, busy }: ViewProps) {
  const t = useT();
  const room = view.room;
  const me = view.me;
  const identity = view.identity;
  const confirmed = Boolean(me?.roleConfirmed);

  return (
    <>
      <Card title={t('reveal.hello', { name: me?.nickname ?? '' })}>
        <Banner kind="warn">{t('reveal.privacy')}</Banner>
        {identity ? (
          <SecretVeil coverTitle={t('reveal.covered')} coverHint={t('reveal.privacy')}>
            <IdentityCard identity={identity} />
          </SecretVeil>
        ) : (
          <Banner kind="info">{t('common.loading')}</Banner>
        )}
      </Card>

      <Card>
        <Button
          variant={confirmed ? 'ghost' : 'primary'}
          disabled={busy || confirmed || !identity}
          onClick={() => void dispatch({ type: 'CONFIRM_ROLE' })}
        >
          {confirmed ? t('reveal.confirmed') : t('reveal.confirm')}
        </Button>
        <span className="faint" style={{ textAlign: 'center' }}>
          {t('reveal.progress', {
            done: room.confirmation.confirmed,
            total: room.confirmation.total,
          })}
        </span>
      </Card>

      {confirmed && (
        <Card title={t('reveal.waitOthers')}>
          <PlayerList players={room.players} meId={me?.id} showConfirm />
          <span className="faint">{t('players.remindHint')}</span>
        </Card>
      )}
    </>
  );
}
