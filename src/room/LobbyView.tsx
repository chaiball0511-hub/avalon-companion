import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { MAX_PLAYERS, MIN_PLAYERS, buildRoleComposition } from '@shared/roles';
import { useT } from '../i18n';
import { Banner, Button, Card, Sheet, Tag, useConfirm } from '../components/ui';
import { PlayerList } from '../components/PlayerList';
import { SeatRing } from './SeatRing';
import type { ViewProps } from './types';

/** 等待大厅：房间码分享、座位顺序、第一任队长、房主操作 */
export function LobbyView({ view, dispatch, busy, isTest }: ViewProps) {
  const t = useT();
  const confirm = useConfirm();
  const room = view.room;
  const isHost = Boolean(view.me?.isHost);
  const active = room.players.filter((p) => !p.hasLeft);
  const composition = buildRoleComposition(active.length, room.roleConfig);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);

  const inviteUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/join?code=${encodeURIComponent(room.roomCode)}`;

  useEffect(() => {
    if (!inviteUrl) return;
    let cancelled = false;
    toDataURL(inviteUrl, { margin: 1, width: 336, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteUrl]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 浏览器不支持剪贴板时静默失败 */
    }
  };

  const move = async (playerId: string, delta: number) => {
    const order = room.playerOrder.slice();
    const from = order.indexOf(playerId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to]!, order[from]!];
    await dispatch({ type: 'SET_SEAT_ORDER', order });
  };

  const managed = manageId ? room.players.find((p) => p.id === manageId) : null;
  const missing = Math.max(0, MIN_PLAYERS - active.length);
  const ladyHolderName = (() => {
    if (!room.roleConfig.ladyOfTheLake || !room.firstLeaderPlayerId) return null;
    const order = room.playerOrder.filter((id) => active.some((p) => p.id === id));
    const index = order.indexOf(room.firstLeaderPlayerId);
    if (index === -1 || order.length < 2) return null;
    const holderId = order[(index + 1) % order.length];
    return room.players.find((p) => p.id === holderId)?.nickname ?? null;
  })();

  return (
    <>
      {room.status === 'RESTARTING' && <Banner kind="warn">{t('room.restarting')}</Banner>}

      <Card title={t('lobby.roomCode')}>
        <div className="room-code">{room.roomCode}</div>
        {qr && !isTest && (
          <div className="qr-box">
            <img src={qr} alt={t('lobby.scanToJoin')} width={168} height={168} />
          </div>
        )}
        {!isTest && (
          <Button variant="ghost" onClick={copyInvite}>
            {copied ? t('common.copied') : t('lobby.copyLink')}
          </Button>
        )}
        <span className="faint" style={{ textAlign: 'center' }}>
          {t('lobby.scanToJoin')}
        </span>
      </Card>

      <Card
        title={t('lobby.players', { n: active.length })}
        right={<Tag tone={active.length >= MIN_PLAYERS ? 'good' : 'off'}>{`${active.length}/${MAX_PLAYERS}`}</Tag>}
      >
        {missing > 0 ? (
          <Banner kind="warn">{t('lobby.needMore', { n: missing })}</Banner>
        ) : (
          <Banner kind="info">{t('lobby.ready')}</Banner>
        )}

        <PlayerList
          players={room.players}
          meId={view.me?.id}
          onSelect={isHost ? (id) => setManageId(id) : undefined}
          renderRight={
            isHost
              ? (player) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button
                      size="small"
                      variant="ghost"
                      disabled={busy || player.seatIndex === 0}
                      aria-label={t('lobby.moveUp')}
                      onClick={(event) => {
                        event.stopPropagation();
                        void move(player.id, -1);
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      size="small"
                      variant="ghost"
                      disabled={busy || player.seatIndex === room.playerOrder.length - 1}
                      aria-label={t('lobby.moveDown')}
                      onClick={(event) => {
                        event.stopPropagation();
                        void move(player.id, 1);
                      }}
                    >
                      ↓
                    </Button>
                  </div>
                )
              : undefined
          }
        />
        {isHost && <span className="faint">{t('lobby.tapToSetLeader')}</span>}
      </Card>

      <Card title={t('lobby.seatOrder')}>
        <SeatRing players={room.players} meId={view.me?.id} />
        <span className="faint">{t('lobby.seatHint')}</span>
        <hr className="divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span className="muted">{t('lobby.firstLeader')}</span>
          <strong>
            {room.players.find((p) => p.id === room.firstLeaderPlayerId)?.nickname ??
              t('lobby.firstLeaderNone')}
          </strong>
        </div>
        <span className="faint">{t('lobby.firstLeaderHint')}</span>
        {ladyHolderName && <Banner kind="info">{t('lobby.ladyInitial', { name: ladyHolderName })}</Banner>}
      </Card>

      <Card title={t('config.overview')}>
        <div className="grid-2">
          <div className="stat">
            <div className="value" style={{ color: 'var(--good)' }}>
              {composition.goodSlots}
            </div>
            <div className="label">{t('config.goodSlots')}</div>
          </div>
          <div className="stat">
            <div className="value" style={{ color: 'var(--evil)' }}>
              {composition.evilSlots}
            </div>
            <div className="label">{t('config.evilSlots')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[...composition.goodSpecials, ...composition.evilSpecials].map((role) => (
            <Tag key={role} tone={composition.goodSpecials.includes(role) ? 'good' : 'evil'}>
              {t(`role.${role}.name`)}
            </Tag>
          ))}
          {room.roleConfig.ladyOfTheLake && <Tag tone="gold">{t('config.lady')}</Tag>}
        </div>
      </Card>

      {isHost ? (
        <Card title={t('lobby.hostControls')}>
          <Button variant="ghost" disabled={busy} onClick={() => void dispatch({ type: 'OPEN_ROLE_CONFIG' })}>
            {t('lobby.roleConfig')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || active.length < MIN_PLAYERS || !composition.valid}
            onClick={() => void dispatch({ type: 'START_GAME' })}
          >
            {t('lobby.start')}
          </Button>
          {!composition.valid && composition.errors[0] && (
            <Banner kind="error">{t(`error.${composition.errors[0].code}`, composition.errors[0].params)}</Banner>
          )}
        </Card>
      ) : (
        <Banner kind="info">{t('lobby.waitingHost')}</Banner>
      )}

      {managed && isHost && (
        <Sheet title={managed.nickname} onClose={() => setManageId(null)}>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void dispatch({ type: 'SET_FIRST_LEADER', playerId: managed.id });
              setManageId(null);
            }}
          >
            {t('lobby.firstLeader')}
          </Button>
          {managed.id !== room.hostPlayerId && (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('lobby.transferHost'),
                    message: t('lobby.transferHostConfirm', { name: managed.nickname }),
                  });
                  if (ok) await dispatch({ type: 'TRANSFER_HOST', playerId: managed.id });
                  setManageId(null);
                }}
              >
                {t('lobby.transferHost')}
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('lobby.remove'),
                    message: t('lobby.removeConfirm', { name: managed.nickname }),
                    danger: true,
                  });
                  if (ok) await dispatch({ type: 'REMOVE_PLAYER', playerId: managed.id });
                  setManageId(null);
                }}
              >
                {t('lobby.remove')}
              </Button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
