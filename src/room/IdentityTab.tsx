import { useT } from '../i18n';
import { Banner, Card, Tag } from '../components/ui';
import { SecretVeil } from '../components/SecretVeil';
import { IdentityCard } from './IdentityCard';
import type { ViewProps } from './types';

/** 「我的身份」标签页：对局中随时秘密复查 */
export function IdentityTab({ view }: ViewProps) {
  const t = useT();

  return (
    <>
      <Card title={t('reveal.myIdentity')}>
        {view.identity ? (
          <>
            <Banner kind="warn">{t('reveal.privacy')}</Banner>
            <SecretVeil coverTitle={t('reveal.covered')} coverHint={t('reveal.reviewHint')}>
              <IdentityCard identity={view.identity} />
            </SecretVeil>
          </>
        ) : (
          <Banner kind="info">{t('room.waitingConfig')}</Banner>
        )}
      </Card>

      {view.room.lady.enabled && (
        <Card title={t('lady.myResults')}>
          {view.myLadyResults.length === 0 ? (
            <span className="faint">{t('lady.noResults')}</span>
          ) : (
            <SecretVeil coverTitle={t('reveal.covered')} coverHint={t('lady.privateOnly')}>
              <div className="list">
                {view.myLadyResults.map((item) => (
                  <div key={item.order} className="player-row">
                    <span className="seat">{item.order}</span>
                    <span className="name">{item.targetNickname}</span>
                    <Tag tone={item.targetAlignment === 'GOOD' ? 'good' : 'evil'}>
                      {t(`alignment.${item.targetAlignment}`)}
                    </Tag>
                  </div>
                ))}
              </div>
            </SecretVeil>
          )}
        </Card>
      )}
    </>
  );
}
