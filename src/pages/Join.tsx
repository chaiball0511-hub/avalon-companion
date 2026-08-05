import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useT } from '../i18n';
import { ApiError, api, type RoomSummary } from '../state/api';
import { lastNickname, loadSession, saveSession } from '../state/session';
import { Banner, Body, Button, Card, Header, Screen, Tag } from '../components/ui';
import { NICKNAME_MAX_LENGTH } from '@shared/constants';

const ROOM_CODE_LEN = 6;

/** 加入房间：输入房间码 + 昵称；支持「恢复席位」（丢失凭证后由房主批准）。 */
export default function Join(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [nickname, setNickname] = useState(lastNickname());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RoomSummary | null>(null);

  // 恢复席位轮询状态
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [claimPlayerId, setClaimPlayerId] = useState<string | null>(null);
  const [claimRoomId, setClaimRoomId] = useState<string | null>(null);

  const existing = loadSession();
  const canUseStored = existing?.roomCode === code.toUpperCase();

  const refreshSummary = async (roomCode: string) => {
    try {
      setSummary(await api.summary(roomCode));
    } catch {
      setSummary(null);
    }
  };

  const join = async () => {
    const roomCode = code.trim().toUpperCase();
    const name = nickname.trim();
    if (roomCode.length !== ROOM_CODE_LEN) {
      setError(t('error.ROOM_NOT_FOUND'));
      return;
    }
    if (!name) {
      setError(t('error.NICKNAME_REQUIRED'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinRoom(roomCode, name);
      saveSession({
        roomId: res.roomId,
        roomCode: res.roomCode,
        playerId: res.playerId,
        playerToken: res.playerToken,
        nickname: name,
      });
      navigate('/room', { replace: true });
    } catch (err) {
      const code2 = err instanceof ApiError ? err.code : 'INTERNAL_ERROR';
      setError(t(`error.${code2}`, err instanceof ApiError ? err.params ?? undefined : undefined));
      void refreshSummary(roomCode);
      setBusy(false);
    }
  };

  const startRecover = async (targetPlayerId: string) => {
    const roomCode = code.trim().toUpperCase();
    setBusy(true);
    setError(null);
    try {
      const claim = await api.requestSeatClaim(roomCode, targetPlayerId);
      setClaimId(claim.claimId);
      setClaimToken(claim.playerToken);
      setClaimPlayerId(claim.playerId);
      setClaimRoomId(claim.roomId);
    } catch (err) {
      setError(err instanceof ApiError ? t(`error.${err.code}`, err.params ?? undefined) : t('error.INTERNAL_ERROR'));
      setBusy(false);
    }
  };

  // 轮询席位恢复审批结果
  useEffect(() => {
    if (!claimId || !claimToken || !claimPlayerId || !claimRoomId) return;
    let active = true;
    const tick = async () => {
      try {
        const status = await api.seatClaimStatus(code.trim().toUpperCase(), claimId);
        if (!active) return;
        if (status.status === 'APPROVED' && claimToken && claimPlayerId && claimRoomId) {
          saveSession({
            roomId: claimRoomId,
            roomCode: code.trim().toUpperCase(),
            playerId: claimPlayerId,
            playerToken: claimToken,
            nickname: nickname.trim() || existing?.nickname || '玩家',
          });
          navigate('/room', { replace: true });
          return;
        }
        if (status.status === 'REJECTED') {
          setError(t('join.recoverRejected'));
          setClaimId(null);
          setBusy(false);
          return;
        }
        window.setTimeout(tick, 1500);
      } catch {
        if (active) window.setTimeout(tick, 1500);
      }
    };
    void tick();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId]);

  const recoverPending = Boolean(claimId);

  return (
    <Screen>
      <Header title={t('join.title')} onBack={() => navigate('/')} />
      <Body>
        <Card>
          <div className="field">
            <label htmlFor="join-code">{t('join.code')}</label>
            <input
              id="join-code"
              className="input code"
              value={code}
              maxLength={ROOM_CODE_LEN}
              placeholder={t('join.codePlaceholder')}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setSummary(null);
              }}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="join-nickname">{t('join.nickname')}</label>
            <input
              id="join-nickname"
              className="input"
              value={nickname}
              maxLength={NICKNAME_MAX_LENGTH}
              placeholder={t('join.nickname')}
              onChange={(event) => setNickname(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) void join();
              }}
            />
          </div>
          {error && <Banner kind="error">{error}</Banner>}
          <Button variant="primary" disabled={busy || recoverPending} onClick={() => void join()}>
            {busy && !recoverPending ? t('common.loading') : t('join.submit')}
          </Button>
        </Card>

        {summary && (
          <Card title={t('join.found', { code: summary.roomCode, n: summary.playerCount })}>
            <div className="list">
              {summary.players.map((p) => (
                <div key={p.id} className="player-row">
                  <span className="name">
                    {p.nickname}
                    {p.hasLeft && (
                      <Tag tone="evil" >{t('common.left')}</Tag>
                    )}
                    {!p.online && !p.hasLeft && <Tag tone="off">{t('common.offline')}</Tag>}
                  </span>
                </div>
              ))}
            </div>
            {!summary.canJoin && summary.status !== 'DISSOLVED' && (
              <Banner kind="warn">{t('join.started')}</Banner>
            )}
          </Card>
        )}

        <Card title={t('join.recoverTitle')}>
          <span className="muted">{t('join.recoverDesc')}</span>
          {recoverPending ? (
            <Banner kind="info">{t('join.recoverPending')}</Banner>
          ) : canUseStored && existing ? (
            <Button variant="ghost" disabled={busy} onClick={() => void startRecover(existing.playerId)}>
              {t('join.recover')}
            </Button>
          ) : (
            summary && (
              <div className="list">
                {summary.players
                  .filter((p) => p.hasLeft)
                  .map((p) => (
                    <Button
                      key={p.id}
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void startRecover(p.id)}
                    >
                      {t('join.recover')} · {p.nickname}
                    </Button>
                  ))}
                {summary.players.filter((p) => p.hasLeft).length === 0 && (
                  <span className="faint">{t('join.recoverDesc')}</span>
                )}
              </div>
            )
          )}
        </Card>
      </Body>
    </Screen>
  );
}
