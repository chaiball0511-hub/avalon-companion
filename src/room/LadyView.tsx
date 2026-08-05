import { useState } from 'react';
import { useT } from '../i18n';
import { Banner, Button, Card, Tag, useConfirm } from '../components/ui';
import { SecretVeil } from '../components/SecretVeil';
import { QuestTrack } from './QuestTrack';
import type { ViewProps } from './types';

/**
 * 湖上夫人流程。
 *
 * 查看结果是私密信息：只有持有者本人的视图里才会带 pendingResult，
 * 其他玩家（包括房主）拿到的视图里永远没有这个字段。
 */
export function LadyView({ view, dispatch, busy }: ViewProps) {
  const t = useT();
  const confirm = useConfirm();
  const room = view.room;
  const prompt = view.ladyPrompt;
  const holder = room.players.find((p) => p.id === room.lady.currentHolderPlayerId);
  const [picked, setPicked] = useState<string | null>(null);

  if (prompt) {
    const pending = prompt.pendingTarget;
    return (
      <>
        <Card title={t('lady.youHold')} right={<Tag tone="gold">{t('lady.used', { n: room.lady.useCount })}</Tag>}>
          {!pending ? (
            <>
              <p className="muted">{t('lady.pickTarget')}</p>
              {prompt.eligibleTargets.length === 0 ? (
                <Banner kind="warn">{t('lady.noTargets')}</Banner>
              ) : (
                <div className="list">
                  {prompt.eligibleTargets.map((target) => (
                    <div
                      key={target.id}
                      className={`player-row selectable${picked === target.id ? ' selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPicked(target.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setPicked(target.id);
                        }
                      }}
                    >
                      <span className={`dot${target.online ? ' online' : ''}`} />
                      <span className="name">{target.nickname}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="primary"
                disabled={busy || !picked}
                onClick={async () => {
                  if (!picked) return;
                  const target = prompt.eligibleTargets.find((p) => p.id === picked);
                  const ok = await confirm({
                    title: t('lady.title'),
                    message: t('lady.confirmPick', { name: target?.nickname ?? '' }),
                  });
                  if (ok) await dispatch({ type: 'LADY_SELECT_TARGET', targetPlayerId: picked });
                }}
              >
                {t('lady.pickTarget')}
              </Button>
            </>
          ) : (
            <>
              <span className="card-title" style={{ fontSize: 15 }}>
                {t('lady.resultOf', { name: pending.nickname })}
              </span>
              <SecretVeil coverTitle={t('reveal.covered')} coverHint={t('lady.privateOnly')} holdLabel={t('reveal.holding')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: 12 }}>
                  <span className="muted">{pending.nickname}</span>
                  <span
                    className="role-name"
                    style={{ color: prompt.pendingResult === 'EVIL' ? 'var(--evil)' : 'var(--good)' }}
                  >
                    {t(`alignment.${prompt.pendingResult ?? 'GOOD'}`)}
                  </span>
                  <span className="faint">{t('lady.privateOnly')}</span>
                </div>
              </SecretVeil>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void dispatch({ type: 'LADY_ACKNOWLEDGE' })}
              >
                {t('lady.passToken', { name: pending.nickname })}
              </Button>
            </>
          )}
        </Card>
        <Card title={t('console.currentQuest', { n: room.currentQuestNumber })}>
          <QuestTrack quests={room.quests} current={room.currentQuestNumber} />
        </Card>
      </>
    );
  }

  return (
    <>
      <Card title={t('lady.title')}>
        {view.ladyIncoming ? (
          <Banner kind="warn">{t('lady.beingChecked', { name: view.ladyIncoming.holderNickname })}</Banner>
        ) : (
          <Banner kind="info">{t('lady.waitingHolder', { name: holder?.nickname ?? '—' })}</Banner>
        )}
        <span className="faint">{t('lady.used', { n: room.lady.useCount })}</span>
      </Card>
      <Card title={t('console.currentQuest', { n: room.currentQuestNumber })}>
        <QuestTrack quests={room.quests} current={room.currentQuestNumber} />
      </Card>
    </>
  );
}
