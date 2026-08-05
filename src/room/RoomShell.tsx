import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Banner, Body, Button, Card, Header, Screen, Spinner } from '../components/ui';
import type { RoomController } from '../state/controller';
import type { RoomStatus } from '@shared/types';
import { LobbyView } from './LobbyView';
import { RoleConfigView } from './RoleConfigView';
import { RevealView } from './RevealView';
import { ConsoleView } from './ConsoleView';
import { LadyView } from './LadyView';
import { AssassinView } from './AssassinView';
import { ResultView } from './ResultView';
import { IdentityTab } from './IdentityTab';
import { PlayersTab } from './PlayersTab';
import { Settings } from '../pages/Settings';
import type { ViewProps } from './types';

type Tab = 'game' | 'identity' | 'players' | 'settings';

const STATUS_TITLE: Partial<Record<RoomStatus, string>> = {
  LOBBY: 'lobby.title',
  ROLE_CONFIGURATION: 'config.title',
  ROLE_REVEAL: 'reveal.title',
  WAITING_FOR_CONFIRMATION: 'reveal.title',
  IN_GAME: 'console.title',
  LADY_OF_THE_LAKE: 'lady.title',
  ASSASSINATION: 'assassin.title',
  GAME_OVER: 'result.allRoles',
  RESTARTING: 'lobby.title',
};

const TAB_TITLE: Record<Tab, string> = {
  game: 'nav.game',
  identity: 'nav.identity',
  players: 'nav.players',
  settings: 'nav.settings',
};

function statusView(props: ViewProps): JSX.Element | null {
  switch (props.view.room.status) {
    case 'LOBBY':
    case 'RESTARTING':
      return <LobbyView {...props} />;
    case 'ROLE_CONFIGURATION':
      return <RoleConfigView {...props} />;
    case 'ROLE_REVEAL':
    case 'WAITING_FOR_CONFIRMATION':
      return <RevealView {...props} />;
    case 'IN_GAME':
      return <ConsoleView {...props} />;
    case 'LADY_OF_THE_LAKE':
      return <LadyView {...props} />;
    case 'ASSASSINATION':
      return <AssassinView {...props} />;
    case 'GAME_OVER':
      return <ResultView {...props} />;
    default:
      return null;
  }
}

/**
 * 房间内统一外壳：根据状态选择视图、提供底部导航（游戏 / 我的身份 / 玩家 / 设置），
 * 并集中处理加载、实时连接、错误与房间解散等通用状态。
 *
 * 线上房间与单人测试模式都通过这个外壳渲染，因此两种模式下的界面完全一致。
 */
export function RoomShell({
  controller,
  isTest,
  onLeave,
  devPanel,
}: {
  controller: RoomController;
  isTest: boolean;
  onLeave: () => void;
  devPanel?: ReactNode;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('game');
  const { view, connection, error, busy, dispatch } = controller;

  /* 加载中 */
  if (!view) {
    return (
      <Screen>
        <Header title={t('common.loading')} />
        <Body>
          <div className="center-fill">
            <Spinner />
            <span className="faint">
              {isTest ? t('common.loading') : connection === 'connecting' ? t('room.reconnecting') : t('common.loading')}
            </span>
          </div>
        </Body>
      </Screen>
    );
  }

  /* 房间已解散 */
  if (view.room.status === 'DISSOLVED') {
    return (
      <Screen>
        <Header title={t('room.dissolved')} />
        <Body>
          <Card>
            <div className="center-fill">
              <span className="role-name" style={{ color: 'var(--evil)' }}>
                {t('room.dissolved')}
              </span>
              <span className="muted">{t('room.dissolvedDesc')}</span>
            </div>
          </Card>
          <Button variant="primary" onClick={onLeave}>
            {t('room.backHome')}
          </Button>
        </Body>
      </Screen>
    );
  }

  const props: ViewProps = { view, dispatch, busy, isTest };
  const headerTitle = tab === 'game' ? STATUS_TITLE[view.room.status] ?? 'app.name' : TAB_TITLE[tab];

  const navTabs: { key: Tab; label: string }[] = [
    { key: 'game', label: t('nav.game') },
    { key: 'identity', label: t('nav.identity') },
    { key: 'players', label: t('nav.players') },
    { key: 'settings', label: t('nav.settings') },
  ];

  return (
    <Screen>
      <Header title={t(headerTitle)} />
      <Body withNav>
        {!isTest && connection !== 'open' && (
          connection === 'polling' ? (
            <Banner kind="info">{t('room.degraded')}</Banner>
          ) : (
            <Banner kind="warn">
              {connection === 'connecting' ? t('room.reconnecting') : t('room.connectionLost')}
            </Banner>
          )
        )}
        {error && <Banner kind="error">{t(`error.${error.code}`, error.params ?? undefined)}</Banner>}
        {devPanel}

        {tab === 'game' && statusView(props)}
        {tab === 'identity' && <IdentityTab {...props} />}
        {tab === 'players' && <PlayersTab {...props} />}
        {tab === 'settings' && <Settings view={view} isTest={isTest} onLeave={onLeave} />}
      </Body>

      <nav className="bottom-nav" aria-label={t('nav.game')}>
        {navTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'active' : undefined}
            aria-current={tab === item.key ? 'page' : undefined}
            onClick={() => setTab(item.key)}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </Screen>
  );
}
