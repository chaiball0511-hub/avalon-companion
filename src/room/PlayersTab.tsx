import { useT } from '../i18n';
import { Banner, Button, Card, Tag } from '../components/ui';
import { PlayerList } from '../components/PlayerList';
import { SeatRing } from './SeatRing';
import type { ViewProps } from './types';

const PREGAME = ['LOBBY', 'ROLE_CONFIGURATION', 'RESTARTING'];

/** 玩家标签页：只显示公共信息，永远不显示任何人的身份 */
export function PlayersTab({ view, dispatch, busy }: ViewProps) {
  const t = useT();
  const room = view.room;
  const dealt = !PREGAME.includes(room.status);

  return (
    <>
      {view.pendingSeatClaims.length > 0 && (
        <Card title={t('join.recoverTitle')}>
          {view.pendingSeatClaims.map((claim) => (
            <div key={claim.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="muted">{claim.nickname}</span>
              <div className="btn-row">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void dispatch({ type: 'RESOLVE_SEAT_CLAIM', claimId: claim.id, approve: false })}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void dispatch({ type: 'RESOLVE_SEAT_CLAIM', claimId: claim.id, approve: true })}
                >
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card
        title={t('players.title')}
        right={
          dealt ? (
            <Tag tone="gold">
              {room.confirmation.confirmed}/{room.confirmation.total}
            </Tag>
          ) : undefined
        }
      >
        <PlayerList players={room.players} meId={view.me?.id} showConfirm={dealt} />
        <span className="faint">{t('players.remindHint')}</span>
      </Card>

      <Card title={t('lobby.seatOrder')}>
        <SeatRing players={room.players} meId={view.me?.id} />
        <span className="faint">{t('lobby.seatHint')}</span>
      </Card>

      {room.composition && (
        <Card title={t('config.finalList')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(
              room.composition.reduce<Record<string, number>>((acc, role) => {
                acc[role] = (acc[role] ?? 0) + 1;
                return acc;
              }, {}),
            ).map(([role, count]) => (
              <Tag
                key={role}
                tone={role === 'MERLIN' || role === 'PERCIVAL' || role === 'LOYAL_SERVANT' ? 'good' : 'evil'}
              >
                {t(`role.${role}.name`)}
                {count > 1 ? ` ×${count}` : ''}
              </Tag>
            ))}
          </div>
          <Banner kind="info">{t('settings.aboutText')}</Banner>
        </Card>
      )}
    </>
  );
}
