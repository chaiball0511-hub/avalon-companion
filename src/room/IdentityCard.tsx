import type { PrivateIdentityView } from '@shared/types';
import { Crest } from '../components/Crest';
import { Tag } from '../components/ui';
import { useT } from '../i18n';

/**
 * 身份内容。始终包裹在 SecretVeil 内部渲染，
 * 只有在「按住 / 点击查看」时才会出现在屏幕上。
 */
export function IdentityCard({ identity }: { identity: PrivateIdentityView }) {
  const t = useT();
  const evil = identity.alignment === 'EVIL';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Crest role={identity.role} />
        <div style={{ minWidth: 0 }}>
          <div className="role-name">{t(`role.${identity.role}.name`)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <Tag tone={evil ? 'evil' : 'good'}>{t(`alignment.${identity.alignment}`)}</Tag>
            <Tag>{t(`role.${identity.role}.short`)}</Tag>
          </div>
        </div>
      </div>

      <hr className="divider" />

      {identity.knownLabel && identity.knownPlayers.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="card-title" style={{ fontSize: 14 }}>
            {t(`reveal.label.${identity.knownLabel}`)}
          </span>
          <div className="list">
            {identity.knownPlayers.map((player) => (
              <div key={player.id} className="player-row">
                <span className="seat">?</span>
                <span className="name">{player.nickname}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted">{t('reveal.noExtra')}</p>
      )}

      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {identity.noteKeys.map((key) => (
          <li key={key} className="muted">
            {t(key)}
          </li>
        ))}
      </ul>
    </>
  );
}
