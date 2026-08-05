import { LADY_MIN_PLAYERS, MIN_PLAYERS, buildRoleComposition } from '@shared/roles';
import type { Role, RoleConfig } from '@shared/types';
import { useT } from '../i18n';
import { Banner, Button, Card, Switch, Tag } from '../components/ui';
import type { ViewProps } from './types';

function RoleSwitchRow({
  role,
  checked,
  disabled,
  locked,
  onChange,
}: {
  role: Role;
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  onChange?: (next: boolean) => void;
}) {
  const t = useT();
  const evil = role === 'ASSASSIN' || role === 'MORGANA' || role === 'MORDRED' || role === 'OBERON';
  return (
    <div className="switch-row">
      <div className="info">
        <div className="name">
          {t(`role.${role}.name`)}
          <Tag tone={evil ? 'evil' : 'good'}>{t(evil ? 'alignment.EVIL' : 'alignment.GOOD')}</Tag>
        </div>
        <span className="faint">{t(`role.${role}.short`)}</span>
      </div>
      {locked ? (
        <Tag tone="gold">{t('config.core')}</Tag>
      ) : (
        <Switch
          checked={checked}
          disabled={disabled}
          label={t(`role.${role}.name`)}
          onChange={(next) => onChange?.(next)}
        />
      )}
    </div>
  );
}

/** 角色配置：房主实时调整，所有玩家同步看到本局构成 */
export function RoleConfigView({ view, dispatch, busy }: ViewProps) {
  const t = useT();
  const room = view.room;
  const isHost = Boolean(view.me?.isHost);
  const active = room.players.filter((p) => !p.hasLeft);
  const playerCount = active.length;
  const composition = buildRoleComposition(playerCount, room.roleConfig);

  const update = (patch: Partial<RoleConfig>) => {
    void dispatch({ type: 'SET_ROLE_CONFIG', config: { ...room.roleConfig, ...patch } });
  };

  const finalRoles = composition.roles.slice().sort();
  const roleCounts = finalRoles.reduce<Record<string, number>>((acc, role) => {
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      {!isHost && <Banner kind="info">{t('room.waitingConfig')}</Banner>}

      <Card title={t('config.overview')}>
        <div className="grid-2">
          <div className="stat">
            <div className="value">{playerCount}</div>
            <div className="label">{t('config.playerCount')}</div>
          </div>
          <div className="stat">
            <div className="value">
              <span style={{ color: 'var(--good)' }}>{composition.goodSlots}</span>
              <span className="faint"> / </span>
              <span style={{ color: 'var(--evil)' }}>{composition.evilSlots}</span>
            </div>
            <div className="label">
              {t('config.goodSlots')} / {t('config.evilSlots')}
            </div>
          </div>
        </div>
        <div>
          <span className="card-title" style={{ fontSize: 14 }}>
            {t('config.finalList')}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {Object.entries(roleCounts).map(([role, count]) => (
              <Tag
                key={role}
                tone={
                  role === 'MERLIN' || role === 'PERCIVAL' || role === 'LOYAL_SERVANT' ? 'good' : 'evil'
                }
              >
                {t(`role.${role}.name`)}
                {count > 1 ? ` ×${count}` : ''}
              </Tag>
            ))}
            {finalRoles.length === 0 && <span className="faint">{t('config.cannotStart')}</span>}
          </div>
        </div>
        {composition.errors.map((issue) => (
          <Banner key={issue.code} kind="error">
            {t(`error.${issue.code}`, issue.params)}
          </Banner>
        ))}
        {composition.warnings.map((issue) => (
          <Banner key={issue.code} kind="warn">
            {t(`error.${issue.code}`, issue.params)}
          </Banner>
        ))}
      </Card>

      <Card title={t('config.core')}>
        <RoleSwitchRow role="MERLIN" checked locked />
        <RoleSwitchRow role="ASSASSIN" checked locked />
      </Card>

      <Card title={t('config.recommended')}>
        <RoleSwitchRow
          role="PERCIVAL"
          checked={room.roleConfig.percival}
          disabled={!isHost || busy}
          onChange={(next) => update({ percival: next })}
        />
        <RoleSwitchRow
          role="MORGANA"
          checked={room.roleConfig.morgana}
          disabled={!isHost || busy}
          onChange={(next) => update({ morgana: next })}
        />
      </Card>

      <Card title={t('config.optional')}>
        <RoleSwitchRow
          role="MORDRED"
          checked={room.roleConfig.mordred}
          disabled={!isHost || busy}
          onChange={(next) => update({ mordred: next })}
        />
        <RoleSwitchRow
          role="OBERON"
          checked={room.roleConfig.oberon}
          disabled={!isHost || busy}
          onChange={(next) => update({ oberon: next })}
        />
        <span className="faint">
          {t('config.autoFill')}：{t('role.LOYAL_SERVANT.name')} ×{composition.loyalServantCount} ·{' '}
          {t('role.MINION.name')} ×{composition.minionCount}
        </span>
      </Card>

      <Card title={t('config.expansion')}>
        <div className="switch-row">
          <div className="info">
            <div className="name">{t('config.lady')}</div>
            <span className="faint">{t('config.ladyDesc')}</span>
          </div>
          <Switch
            checked={room.roleConfig.ladyOfTheLake}
            disabled={!isHost || busy || playerCount < LADY_MIN_PLAYERS}
            label={t('config.lady')}
            onChange={(next) => update({ ladyOfTheLake: next })}
          />
        </div>
        {playerCount < LADY_MIN_PLAYERS && <Banner kind="info">{t('config.ladyDisabled')}</Banner>}
        {room.roleConfig.ladyOfTheLake && !room.firstLeaderPlayerId && (
          <Banner kind="warn">{t('error.FIRST_LEADER_REQUIRED')}</Banner>
        )}
      </Card>

      {isHost && (
        <Card>
          <Button variant="ghost" disabled={busy} onClick={() => void dispatch({ type: 'BACK_TO_LOBBY' })}>
            {t('config.saveAndBack')}
          </Button>
          <Button
            variant="primary"
            disabled={
              busy ||
              !composition.valid ||
              playerCount < MIN_PLAYERS ||
              (room.roleConfig.ladyOfTheLake && !room.firstLeaderPlayerId)
            }
            onClick={() => void dispatch({ type: 'START_GAME' })}
          >
            {t('config.start')}
          </Button>
        </Card>
      )}
    </>
  );
}
