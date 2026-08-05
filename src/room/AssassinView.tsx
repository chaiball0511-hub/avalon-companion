import { useState } from 'react';
import { useT } from '../i18n';
import { Banner, Button, Card } from '../components/ui';
import { useConfirm } from '../components/ui';
import { QuestTrack } from './QuestTrack';
import type { ViewProps } from './types';

/** 好人三次成功后的刺杀阶段 */
export function AssassinView({ view, dispatch, busy }: ViewProps) {
  const t = useT();
  const confirm = useConfirm();
  const room = view.room;
  const prompt = view.assassinPrompt;
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <Card title={t('assassin.title')}>
        {prompt ? (
          <>
            <Banner kind="warn">{t('assassin.intro')}</Banner>
            <div className="list">
              {prompt.candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className={`player-row selectable${picked === candidate.id ? ' selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPicked(candidate.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setPicked(candidate.id);
                    }
                  }}
                >
                  <span className="seat">?</span>
                  <span className="name">{candidate.nickname}</span>
                </div>
              ))}
            </div>
            <Button
              variant="evil"
              disabled={busy || !picked}
              onClick={async () => {
                if (!picked) return;
                const target = prompt.candidates.find((c) => c.id === picked);
                const ok = await confirm({
                  title: t('assassin.submit'),
                  message: t('assassin.confirm', { name: target?.nickname ?? '' }),
                  danger: true,
                });
                if (ok) await dispatch({ type: 'SUBMIT_ASSASSINATION', targetPlayerId: picked });
              }}
            >
              {t('assassin.submit')}
            </Button>
          </>
        ) : room.assassination?.assassinSubmitted ? (
          <Banner kind="info">{t('assassin.done')}</Banner>
        ) : (
          <Banner kind="warn">{t('assassin.othersWaiting')}</Banner>
        )}
      </Card>

      <Card title={t('result.questLog')}>
        <QuestTrack quests={room.quests} current={room.currentQuestNumber} />
      </Card>
    </>
  );
}
