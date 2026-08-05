import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { ApiError, api } from '../state/api';
import { getDeviceId, lastNickname, saveSession } from '../state/session';
import { Banner, Body, Button, Card, Header, Screen } from '../components/ui';
import { NICKNAME_MAX_LENGTH } from '@shared/constants';

/** 创建房间：填写昵称即成为房主（房主同时也是普通玩家）。 */
export default function Create(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(lastNickname());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const name = nickname.trim();
    if (!name) {
      setError(t('error.NICKNAME_REQUIRED'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.createRoom(name, getDeviceId());
      saveSession({
        roomId: res.roomId,
        roomCode: res.roomCode,
        playerId: res.playerId,
        playerToken: res.playerToken,
        hostToken: res.hostToken,
        nickname: name,
      });
      navigate('/room', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? t(`error.${err.code}`, err.params ?? undefined) : t('error.INTERNAL_ERROR'));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={t('create.title')} onBack={() => navigate('/')} />
      <Body>
        <Card>
          <div className="field">
            <label htmlFor="create-nickname">{t('create.nickname')}</label>
            <input
              id="create-nickname"
              className="input"
              value={nickname}
              maxLength={NICKNAME_MAX_LENGTH}
              placeholder={t('create.nicknamePlaceholder')}
              onChange={(event) => setNickname(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) void submit();
              }}
              autoFocus
            />
          </div>
          <Banner kind="info">{t('create.hint')}</Banner>
          {error && <Banner kind="error">{error}</Banner>}
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? t('common.loading') : t('create.submit')}
          </Button>
        </Card>
      </Body>
    </Screen>
  );
}
