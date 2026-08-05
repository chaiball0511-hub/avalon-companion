import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { Body, Button, Screen } from '../components/ui';

/** 404：未知路由兜底。 */
export default function NotFound(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Screen>
      <Body>
        <div className="center-fill">
          <span className="role-name">404</span>
          <span className="muted">{t('app.name')}</span>
          <Button variant="primary" onClick={() => navigate('/')}>
            {t('room.backHome')}
          </Button>
        </div>
      </Body>
    </Screen>
  );
}
