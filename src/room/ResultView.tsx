import { useT } from '../i18n';
import { Banner, Button, Card, Tag, useConfirm } from '../components/ui';
import { Crest } from '../components/Crest';
import { QuestTrack } from './QuestTrack';
import type { ViewProps } from './types';

/** 终局：公开全部身份 */
export function ResultView({ view, dispatch, busy }: ViewProps) {
  const t = useT();
  const confirm = useConfirm();
  const room = view.room;
  const isHost = Boolean(view.me?.isHost);
  const goodWin = room.winner === 'GOOD';
  const assassinTarget = room.assassination?.targetPlayerId
    ? room.players.find((p) => p.id === room.assassination?.targetPlayerId)
    : null;

  return (
    <>
      <Card>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span
            className="role-name"
            style={{ color: goodWin ? 'var(--good)' : 'var(--evil)' }}
          >
            {t(goodWin ? 'result.goodWin' : 'result.evilWin')}
          </span>
          {room.endReason && <span className="muted">{t(`result.reason.${room.endReason}`)}</span>}
          {assassinTarget && (
            <span className="faint">{t('result.assassinTarget', { name: assassinTarget.nickname })}</span>
          )}
        </div>
      </Card>

      <Card title={t('result.questLog')}>
        <QuestTrack quests={room.quests} current={0} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {room.quests.map((quest) => (
            <Tag key={quest.questNumber} tone={quest.result === 'SUCCESS' ? 'good' : 'evil'}>
              {t('result.quest', { n: quest.questNumber })}·
              {t(quest.result === 'SUCCESS' ? 'result.success' : 'result.fail')}
            </Tag>
          ))}
        </div>
      </Card>

      <Card title={t('result.allRoles')}>
        {view.fullReveal ? (
          <div className="list">
            {view.fullReveal.map((entry) => (
              <div key={entry.playerId} className="player-row">
                <Crest role={entry.role} size={30} />
                <span className="name">
                  {entry.nickname}
                  {entry.playerId === view.me?.id && <span className="faint">（{t('common.you')}）</span>}
                </span>
                <Tag tone={entry.alignment === 'GOOD' ? 'good' : 'evil'}>{t(`role.${entry.role}.name`)}</Tag>
              </div>
            ))}
          </div>
        ) : (
          <Banner kind="info">{t('common.loading')}</Banner>
        )}
      </Card>

      {view.myLadyResults.length > 0 && (
        <Card title={t('lady.myResults')}>
          {view.myLadyResults.map((item) => (
            <div key={item.order} className="player-row">
              <span className="seat">{item.order}</span>
              <span className="name">{item.targetNickname}</span>
              <Tag tone={item.targetAlignment === 'GOOD' ? 'good' : 'evil'}>
                {t(`alignment.${item.targetAlignment}`)}
              </Tag>
            </div>
          ))}
        </Card>
      )}

      {isHost && (
        <Card>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({ title: t('result.again'), message: t('room.restartConfirm') });
              if (ok) await dispatch({ type: 'RESTART' });
            }}
          >
            {t('result.again')}
          </Button>
        </Card>
      )}
    </>
  );
}
