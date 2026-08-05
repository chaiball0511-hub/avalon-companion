import { useState } from 'react';
import { LADY_MAX_USES, MAX_QUESTS } from '@shared/roles';
import { useT } from '../i18n';
import { Banner, Button, Card, Sheet, Tag, useConfirm } from '../components/ui';
import { QuestTrack } from './QuestTrack';
import { SeatRing } from './SeatRing';
import type { ViewProps } from './types';

/**
 * 线下游戏控制台。
 *
 * 这里没有任何线上投票 / 组队 / 发船功能：
 * 组队、发船、投票、任务牌全部在牌桌上完成，房主只录入每次任务的最终结果。
 */
export function ConsoleView({ view, dispatch, busy }: ViewProps) {
  const t = useT();
  const confirm = useConfirm();
  const room = view.room;
  const isHost = Boolean(view.me?.isHost);
  const [moreOpen, setMoreOpen] = useState(false);

  const questNumber = room.currentQuestNumber;
  const allRecorded = room.quests.length >= MAX_QUESTS;
  const paused = room.pause;
  const pausedPlayer = paused ? room.players.find((p) => p.id === paused.playerId) : null;
  const playerCount = room.players.filter((p) => !p.hasLeft).length;
  const ladyHolder = room.players.find((p) => p.id === room.lady.currentHolderPlayerId);

  const record = async (result: 'SUCCESS' | 'FAIL') => {
    const ok = await confirm({
      title: t(result === 'SUCCESS' ? 'console.recordSuccess' : 'console.recordFail'),
      message: t(result === 'SUCCESS' ? 'console.confirmSuccess' : 'console.confirmFail', {
        n: questNumber,
      }),
    });
    if (ok) await dispatch({ type: 'RECORD_QUEST', result });
  };

  return (
    <>
      {paused && (
        <Card title={t('console.paused')}>
          <Banner kind="error">
            {t('console.pausedDesc', { name: pausedPlayer?.nickname ?? t('common.unknown') })}
          </Banner>
          {isHost ? (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void dispatch({ type: 'RESOLVE_ABSENCE', mode: 'WAIT' })}
              >
                {t('console.pausedWait')}
              </Button>
              <span className="faint">{t('console.pausedRestore')}</span>
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('console.pausedRestart'),
                    message: t('room.restartConfirm'),
                    danger: true,
                  });
                  if (ok) await dispatch({ type: 'RESOLVE_ABSENCE', mode: 'RESTART' });
                }}
              >
                {t('console.pausedRestart')}
              </Button>
            </>
          ) : (
            <span className="faint">{t('console.waitHost')}</span>
          )}
        </Card>
      )}

      <Card
        title={allRecorded ? t('console.allRecorded') : t('console.currentQuest', { n: questNumber })}
        right={
          <Tag tone="gold">
            {room.goodSuccessCount} : {room.evilFailCount}
          </Tag>
        }
      >
        <QuestTrack quests={room.quests} current={questNumber} />
        <div className="grid-2">
          <div className="stat">
            <div className="value" style={{ color: 'var(--good)' }}>
              {room.goodSuccessCount}
            </div>
            <div className="label">{t('console.successCount')}</div>
          </div>
          <div className="stat">
            <div className="value" style={{ color: 'var(--evil)' }}>
              {room.evilFailCount}
            </div>
            <div className="label">{t('console.failCount')}</div>
          </div>
        </div>
        <Banner kind="info">{t('console.offlineOnly')}</Banner>
      </Card>

      {isHost ? (
        <Card title={t('console.record')}>
          <div className="btn-row">
            <Button variant="good" disabled={busy || allRecorded || Boolean(paused)} onClick={() => void record('SUCCESS')}>
              {t('console.recordSuccess')}
            </Button>
            <Button variant="evil" disabled={busy || allRecorded || Boolean(paused)} onClick={() => void record('FAIL')}>
              {t('console.recordFail')}
            </Button>
          </div>
          {playerCount >= 7 && questNumber === 4 && <Banner kind="warn">{t('console.rule4th')}</Banner>}
          <Button variant="ghost" onClick={() => setMoreOpen(true)}>
            {t('console.more')}
          </Button>
        </Card>
      ) : (
        <Banner kind="info">{t('console.waitHost')}</Banner>
      )}

      {room.lady.enabled && (
        <Card title={t('lady.title')} right={<Tag>{t('lady.used', { n: room.lady.useCount })}</Tag>}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="muted">{t('lady.holderIs', { name: ladyHolder?.nickname ?? '—' })}</span>
            <Tag tone={room.lady.useCount >= LADY_MAX_USES ? 'off' : 'good'}>
              {room.lady.useCount}/{LADY_MAX_USES}
            </Tag>
          </div>
          {room.lady.history.length > 0 && (
            <>
              <hr className="divider" />
              <span className="card-title" style={{ fontSize: 14 }}>
                {t('lady.historyPublic')}
              </span>
              {room.lady.history.map((item) => (
                <span key={item.order} className="faint">
                  {t('lady.historyItem', {
                    n: item.order,
                    viewer: room.players.find((p) => p.id === item.viewerPlayerId)?.nickname ?? '?',
                    target: room.players.find((p) => p.id === item.targetPlayerId)?.nickname ?? '?',
                  })}
                </span>
              ))}
            </>
          )}
        </Card>
      )}

      <Card title={t('lobby.seatOrder')}>
        <SeatRing players={room.players} meId={view.me?.id} />
      </Card>

      {moreOpen && (
        <Sheet title={t('console.more')} onClose={() => setMoreOpen(false)}>
          <Button
            variant="ghost"
            disabled={busy || room.quests.length === 0}
            onClick={async () => {
              const ok = await confirm({
                title: t('console.undo'),
                message: t('console.confirmUndo', { n: room.quests.length }),
              });
              if (ok) await dispatch({ type: 'UNDO_QUEST' });
              setMoreOpen(false);
            }}
          >
            {t('console.undo')}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: t('console.fiveRejects'),
                message: t('console.confirmFiveRejects'),
                danger: true,
              });
              if (ok) await dispatch({ type: 'FIVE_REJECTS' });
              setMoreOpen(false);
            }}
          >
            {t('console.fiveRejects')}
          </Button>
        </Sheet>
      )}
    </>
  );
}
