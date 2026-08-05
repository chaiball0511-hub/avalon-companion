import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { useLocalRoom, SCENARIOS, type ScenarioKey, type TestSetup } from '../state/useLocalRoom';
import { Banner, Button, Card, Screen, Switch, Tag } from '../components/ui';
import { RoomShell } from '../room/RoomShell';
import { BrandCrest } from '../components/Crest';
import { LADY_MIN_PLAYERS, MAX_PLAYERS, MIN_PLAYERS } from '@shared/roles';
import type { Role, RoleConfig } from '@shared/types';

const ROLE_SWITCHES: { key: keyof RoleConfig; role: Role }[] = [
  { key: 'percival', role: 'PERCIVAL' },
  { key: 'morgana', role: 'MORGANA' },
  { key: 'mordred', role: 'MORDRED' },
  { key: 'oberon', role: 'OBERON' },
  { key: 'ladyOfTheLake', role: 'MINION' },
];

/** 单人测试模式：一台设备跑完整流程，可切换「当前玩家」演示信息隔离。 */
export default function Test(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const ctrl = useLocalRoom();

  const nicknameOf = (id: string) => ctrl.room?.players.find((p) => p.id === id)?.nickname ?? '???';

  if (!ctrl.room) {
    const setup: TestSetup = ctrl.setup;
    const setConfig = (patch: Partial<RoleConfig>) =>
      ctrl.setSetup({ ...setup, config: { ...setup.config, ...patch } });
    return (
      <Screen>
        <Card>
          <div className="brandmark" style={{ paddingTop: 0 }}>
            <BrandCrest size={56} />
            <span className="zh" style={{ fontSize: 20 }}>
              {t('test.title')}
            </span>
          </div>
          <Banner kind="test">{t('test.badge')}</Banner>
          <Banner kind="info">{t('test.intro')}</Banner>
        </Card>

        <Card title={t('test.playerCount')}>
          <div className="scroll-x">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
              <Button
                key={n}
                variant={setup.playerCount === n ? 'primary' : 'default'}
                className="small"
                onClick={() => ctrl.setSetup({ ...setup, playerCount: n })}
              >
                {n}
              </Button>
            ))}
          </div>
        </Card>

        <Card title={t('config.core')}>
          {ROLE_SWITCHES.map(({ key, role }) => {
            const disabled = key === 'ladyOfTheLake' && setup.playerCount < LADY_MIN_PLAYERS;
            return (
              <div className="switch-row" key={key}>
                <div className="info">
                  <div className="name">
                    {key === 'ladyOfTheLake' ? t('config.lady') : t(`role.${role}.name`)}
                    {key === 'ladyOfTheLake' && <Tag tone="gold">{t('config.expansion')}</Tag>}
                  </div>
                  <span className="faint">
                    {key === 'ladyOfTheLake' ? t('config.ladyDesc') : t(`role.${role}.short`)}
                  </span>
                </div>
                <Switch
                  checked={setup.config[key]}
                  disabled={disabled}
                  label={key}
                  onChange={(next) => setConfig({ [key]: next })}
                />
              </div>
            );
          })}
          {setup.playerCount < LADY_MIN_PLAYERS && (
            <Banner kind="info">{t('config.ladyDisabled')}</Banner>
          )}
        </Card>

        <Card title={t('test.seed')}>
          <div className="switch-row">
            <div className="info">
              <div className="name">{t('test.seedOn')}</div>
            </div>
            <Switch checked={setup.useSeed} label={t('test.seed')} onChange={(next) => ctrl.setSetup({ ...setup, useSeed: next })} />
          </div>
          {setup.useSeed && (
            <div className="field">
              <label htmlFor="seed">{t('test.seedValue')}</label>
              <input
                id="seed"
                className="input"
                type="number"
                value={setup.seed}
                onChange={(event) => ctrl.setSetup({ ...setup, seed: Number(event.target.value) || 0 })}
              />
            </div>
          )}
        </Card>

        <Button variant="primary" onClick={() => ctrl.start(setup)}>
          {t('test.start')}
        </Button>

        <Card title={t('test.scenarios')}>
          <span className="faint">{t('test.autoPlayNote')}</span>
          <div className="list" style={{ marginTop: 8 }}>
            {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
              <Button key={key} variant="ghost" onClick={() => ctrl.loadScenario(key)}>
                {t(`test.scenario.${key}`)}
              </Button>
            ))}
          </div>
        </Card>

        <Button variant="ghost" onClick={() => navigate('/')}>
          {t('test.exit')}
        </Button>
      </Screen>
    );
  }

  const devPanel = (
    <>
      <Banner kind="test">{t('test.badge')}</Banner>

      <Card title={t('test.device')}>
        <span className="muted">{t('test.currentPlayer')}</span>
        <div className="list">
          {ctrl.room.players.map((p) => (
            <div
              key={p.id}
              className={`player-row selectable${ctrl.selectedPlayerId === p.id ? ' selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => ctrl.selectPlayer(p.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  ctrl.selectPlayer(p.id);
                }
              }}
            >
              <span className="seat">{p.seatIndex + 1}</span>
              <span className="name">
                {p.nickname}
                {ctrl.selectedPlayerId === p.id && <span className="faint">（{t('common.you')}）</span>}
              </span>
              <Button
                size="small"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  ctrl.toggleOffline(p.id);
                }}
              >
                {p.online ? t('common.online') : t('common.offline')}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('test.adminPanel')}>
        <div className="btn-row">
          <Button variant="ghost" onClick={() => ctrl.confirmAll()}>
            {t('test.confirmAll')}
          </Button>
          <Button variant="ghost" onClick={() => ctrl.reset()}>
            {t('test.reset')}
          </Button>
        </div>
        <div className="switch-row">
          <div className="info">
            <div className="name">{ctrl.debug ? t('test.hideAnswers') : t('test.showAnswers')}</div>
            <span className="faint">{t('test.answersWarning')}</span>
          </div>
          <Switch checked={ctrl.debug} label={t('test.showAnswers')} onChange={(next) => ctrl.setDebug(next)} />
        </div>
      </Card>

      {ctrl.debug && (
        <Card title={t('test.allRoles')}>
          <div className="list">
            {ctrl.room.assignments.map((a) => (
              <div key={a.playerId} className="player-row">
                <span className="name">{nicknameOf(a.playerId)}</span>
                <Tag tone={a.alignment === 'GOOD' ? 'good' : 'evil'}>{t(`role.${a.role}.name`)}</Tag>
              </div>
            ))}
          </div>
          <span className="card-title" style={{ fontSize: 14 }}>
            {t('test.visibility')}
          </span>
          <div className="list">
            {ctrl.room.assignments.map((a) => (
              <div key={a.playerId} className="player-row">
                <span className="name" style={{ flex: '0 0 auto' }}>
                  {nicknameOf(a.playerId)}:
                </span>
                <span className="faint" style={{ flex: 1 }}>
                  {a.knownPlayerIds.length > 0
                    ? a.knownPlayerIds.map(nicknameOf).join('、')
                    : t('reveal.noExtra')}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );

  return (
    <RoomShell
      controller={ctrl}
      isTest
      onLeave={() => navigate('/')}
      devPanel={devPanel}
    />
  );
}
