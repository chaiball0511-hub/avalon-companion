import { MAX_QUESTS } from '@shared/roles';
import type { QuestOutcome } from '@shared/types';
import { useT } from '../i18n';

/** 五次任务的进度轨道 */
export function QuestTrack({
  quests,
  current,
}: {
  quests: { questNumber: number; result: QuestOutcome }[];
  current: number;
}) {
  const t = useT();
  return (
    <div className="quest-track" role="list">
      {Array.from({ length: MAX_QUESTS }, (_, index) => {
        const questNumber = index + 1;
        const record = quests.find((q) => q.questNumber === questNumber);
        const classes = ['quest-node'];
        if (record) classes.push(record.result === 'SUCCESS' ? 'success' : 'fail');
        else if (questNumber === current) classes.push('current');
        const label = record
          ? `${t('result.quest', { n: questNumber })} ${t(record.result === 'SUCCESS' ? 'result.success' : 'result.fail')}`
          : t('result.quest', { n: questNumber });
        return (
          <div key={questNumber} className={classes.join(' ')} role="listitem" aria-label={label}>
            {record ? (record.result === 'SUCCESS' ? '✓' : '✕') : questNumber}
          </div>
        );
      })}
    </div>
  );
}
