import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { Banner, Body, Button, Card, Screen, Tag, useConfirm } from '../components/ui';
import { BrandCrest } from '../components/Crest';
import { loadSession, clearSession } from '../state/session';

/** 首页：创建房间 / 加入房间 / 单人测试模式，以及「正在进行的房间」快捷入口。 */
export default function Home(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const session = loadSession();

  const leave = async () => {
    const ok = await confirm({ title: t('home.activeRoom.leave'), message: t('home.activeRoom.leaveConfirm') });
    if (ok) {
      clearSession();
      navigate('/', { replace: true });
    }
  };

  return (
    <Screen>
      <Body>
        <div className="brandmark">
          <BrandCrest />
          <span className="en">{t('app.nameEn')}</span>
          <span className="zh">{t('app.name')}</span>
          <span className="faint">{t('app.tagline')}</span>
        </div>

        {session && (
          <Card>
            <Banner kind="info">
              {t('home.activeRoom.title')}
              <br />
              <span className="faint">
                {t('home.activeRoom.desc', { code: session.roomCode, nickname: session.nickname })}
              </span>
            </Banner>
            <div className="btn-row">
              <Button variant="ghost" onClick={() => void leave()}>
                {t('home.activeRoom.leave')}
              </Button>
              <Button variant="primary" onClick={() => navigate('/room', { replace: true })}>
                {t('home.activeRoom.enter')}
              </Button>
            </div>
          </Card>
        )}

        <div className="list" style={{ gap: 12 }}>
          <Button variant="primary" onClick={() => navigate('/create')}>
            {t('home.create')}
          </Button>
          <Button variant="default" onClick={() => navigate('/join')}>
            {t('home.join')}
          </Button>
          <Button variant="default" onClick={() => navigate('/test')}>
            {t('home.test')}
            <Tag tone="off">{t('home.testDesc')}</Tag>
          </Button>
        </div>

        <Card title={t('home.help.title')}>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li className="muted">{t('home.help.1')}</li>
            <li className="muted">{t('home.help.2')}</li>
            <li className="muted">{t('home.help.3')}</li>
            <li className="muted">{t('home.help.4')}</li>
            <li className="muted">{t('home.help.5')}</li>
          </ol>
        </Card>
      </Body>
    </Screen>
  );
}
