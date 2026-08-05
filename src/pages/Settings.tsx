import { useT, LOCALE_LABELS, type Locale, useI18n } from '../i18n';
import { useTheme } from '../state/theme';
import { Button, Card, Tag } from '../components/ui';
import type { PlayerView } from '@shared/types';

/** 「设置」标签页：外观、语言、房间信息、关于、返回首页。 */
export function Settings({
  view,
  isTest,
  onLeave,
}: {
  view: PlayerView;
  isTest: boolean;
  onLeave: () => void;
}) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [theme, setTheme] = useTheme();

  return (
    <>
      <Card title={t('settings.roomInfo')}>
        <div className="field">
          <label>{t('settings.roomId')}</label>
          <div className="room-code" style={{ fontSize: 26 }}>
            {view.room.roomCode}
          </div>
        </div>
        <div className="field" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ margin: 0 }}>{t('settings.myNickname')}</label>
          <span className="muted">{view.me?.nickname}</span>
        </div>
        <div className="field" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ margin: 0 }}>{t('settings.role')}</label>
          <Tag tone={view.me?.isHost ? 'gold' : 'default'}>
            {view.me?.isHost ? t('common.host') : t('common.you')}
          </Tag>
        </div>
      </Card>

      <Card title={t('settings.theme')}>
        <div className="btn-row">
          <Button variant={theme === 'dark' ? 'primary' : 'default'} onClick={() => setTheme('dark')}>
            {t('settings.dark')}
          </Button>
          <Button variant={theme === 'light' ? 'primary' : 'default'} onClick={() => setTheme('light')}>
            {t('settings.light')}
          </Button>
        </div>
      </Card>

      <Card title={t('settings.language')}>
        <div className="btn-row">
          {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
            <Button key={l} variant={locale === l ? 'primary' : 'default'} onClick={() => setLocale(l)}>
              {LOCALE_LABELS[l]}
            </Button>
          ))}
        </div>
      </Card>

      <Card title={t('settings.about')}>
        <span className="muted">{t('settings.aboutText')}</span>
      </Card>

      <Card>
        <Button variant="ghost" onClick={onLeave}>
          {t('room.backHome')}
        </Button>
        {!isTest && <span className="faint" style={{ textAlign: 'center' }}>{t('room.backHomeHint')}</span>}
      </Card>
    </>
  );
}
