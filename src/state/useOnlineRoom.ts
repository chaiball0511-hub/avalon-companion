import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action } from '@shared/engine';
import type { PlayerView } from '@shared/types';
import { ApiError, api, type Credentials } from './api';
import { patchSession, type StoredSession } from './session';
import type { ConnectionState, ControllerError, RoomController } from './controller';

function wsUrl(roomId: string, creds: Credentials): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const query = new URLSearchParams({
    roomId,
    playerId: creds.playerId,
    token: creds.playerToken,
  });
  return `${protocol}://${window.location.host}/ws?${query.toString()}`;
}

/** 线上房间控制器：REST 发动作，WebSocket 收个人化视图 */
export function useOnlineRoom(session: StoredSession | null): RoomController & { session: StoredSession | null } {
  const [view, setView] = useState<PlayerView | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<ControllerError | null>(null);
  const [busy, setBusy] = useState(false);
  const [localSession, setLocalSession] = useState<StoredSession | null>(session);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const lastPollOk = useRef(false);
  const sessionRef = useRef<StoredSession | null>(session);
  // 实时通道降级控制：当检测到 WebSocket 在当前网络环境下不稳定（频繁快速断开）时，
  // 放弃实时通道、长期使用 HTTP 轮询兜底，避免「重新连接」横幅反复闪烁。
  const wsGaveUp = useRef(false);
  const wsDropStreak = useRef(0);
  const lastConnectAt = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
    setLocalSession(session);
  }, [session]);

  const credentials = useCallback((): Credentials | null => {
    const s = sessionRef.current;
    if (!s) return null;
    return { playerId: s.playerId, playerToken: s.playerToken, hostToken: s.hostToken };
  }, []);

  const absorb = useCallback((envelope: { view: PlayerView; grantedHostToken?: string }) => {
    setView(envelope.view);
    if (envelope.grantedHostToken) {
      const next = patchSession({ hostToken: envelope.grantedHostToken });
      if (next) {
        sessionRef.current = next;
        setLocalSession(next);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    const s = sessionRef.current;
    const creds = credentials();
    if (!s || !creds) return;
    api
      .view(s.roomId, creds)
      .then(absorb)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError({ code: err.code, params: err.params });
      });
  }, [absorb, credentials]);

  /**
   * HTTP 轮询兜底：当 WebSocket 长连接无法建立（如国内网络访问海外托管的
   * Railway 时 WebSocket 被干扰）时，改为每 3 秒用 REST 拉取最新个人化视图。
   * 这样即便实时通道不通，多人游戏仍可正常进行，仅操作延迟约 3 秒。
   */
  const poll = useCallback(() => {
    const s = sessionRef.current;
    const creds = credentials();
    if (!s || !creds) return;
    // WebSocket 已连通时由服务端推送保证实时性，无需轮询
    if (socketRef.current?.readyState === WebSocket.OPEN) return;
    api
      .view(s.roomId, creds)
      .then((envelope) => {
        lastPollOk.current = true;
        absorb(envelope);
        if (socketRef.current?.readyState !== WebSocket.OPEN) setConnection('polling');
      })
      .catch(() => {
        lastPollOk.current = false;
        if (socketRef.current?.readyState !== WebSocket.OPEN) setConnection('closed');
      });
  }, [absorb, credentials]);

  /* --------------------- WebSocket 连接与自动重连 --------------------- */
  useEffect(() => {
    if (!session) {
      setConnection('closed');
      return;
    }
    closedRef.current = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (closedRef.current || wsGaveUp.current) return;
      const creds = credentials();
      if (!creds) return;
      // 若 HTTP 轮询兜底正在稳定工作，重连期间不要弹出「重新连接」警告，保持降级态即可
      if (!lastPollOk.current) setConnection('connecting');
      lastConnectAt.current = Date.now();
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl(session.roomId, creds));
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        wsDropStreak.current = 0;
        setConnection('open');
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as
            | { type: 'state'; view: PlayerView }
            | { type: 'error'; code: string }
            | { type: 'pong' };
          if (message.type === 'state') {
            setView(message.view);
          } else if (message.type === 'error') {
            setError({ code: message.code, params: null });
          }
        } catch {
          /* 忽略非法负载 */
        }
      };
      socket.onclose = () => {
        if (closedRef.current || wsGaveUp.current) return;
        // 检测 WebSocket 是否稳定：若建立连接后极短时间内（<10s）即被断开，
        // 累计快速断开次数；否则视为正常长连接后的断开，重置计数。
        if (Date.now() - lastConnectAt.current < 10_000) wsDropStreak.current += 1;
        else wsDropStreak.current = 0;
        // 连续多次快速断开 → 判定该网络环境下实时通道不可用，长期放弃 WS、纯用轮询兜底，
        // 从而彻底消除「重新连接」横幅的反复闪烁，游戏仍可正常进行（延迟约 3 秒）。
        if (wsDropStreak.current >= 2) {
          wsGaveUp.current = true;
          setConnection('polling');
          return;
        }
        if (!lastPollOk.current) setConnection('connecting');
        scheduleRetry();
      };
      socket.onerror = () => {
        socket.close();
      };
    };

    const scheduleRetry = () => {
      retryRef.current = Math.min(retryRef.current + 1, 6);
      const delay = Math.min(1000 * 2 ** (retryRef.current - 1), 15000);
      reconnectTimer = window.setTimeout(connect, delay);
    };

    const forcePoll = new URLSearchParams(window.location.search).get('realtime') === '0';
    refresh();
    if (forcePoll) {
      // 强制稳定模式：完全不建立 WebSocket，仅用 HTTP 轮询兜底，彻底避免重连闪烁
      setConnection('polling');
    } else {
      connect();
    }

    // 应用层心跳：手机客户端定期发 ping，确保服务端（穿过 Railway 等代理）认定连接存活，
    // 不依赖可能被代理吞掉的 WebSocket ping/pong 控制帧。
    const pingTimer = window.setInterval(() => {
      const s = socketRef.current;
      if (s && s.readyState === WebSocket.OPEN) {
        try {
          s.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* 忽略发送失败 */
        }
      }
    }, 15_000);

    // HTTP 轮询兜底：WebSocket 不通时每 3 秒拉取最新状态，保证游戏可玩
    const pollTimer = window.setInterval(poll, 3000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (!forcePoll && socketRef.current?.readyState !== WebSocket.OPEN) {
          retryRef.current = 0;
          connect();
        }
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      closedRef.current = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      if (pollTimer) window.clearInterval(pollTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [session, credentials, refresh, poll]);

  /* ------------------------------ 动作 ------------------------------ */
  const dispatch = useCallback(
    async (action: Action) => {
      const s = sessionRef.current;
      const creds = credentials();
      if (!s || !creds) return;
      setBusy(true);
      setError(null);
      try {
        const envelope = await api.dispatch(s.roomId, creds, action, {
          expectedVersion: undefined,
          actionId: crypto.randomUUID(),
        });
        absorb(envelope);
      } catch (err) {
        if (err instanceof ApiError) {
          setError({ code: err.code, params: err.params });
          if (err.code === 'VERSION_CONFLICT') refresh();
        } else {
          setError({ code: 'INTERNAL_ERROR', params: null });
        }
      } finally {
        setBusy(false);
      }
    },
    [absorb, credentials, refresh],
  );

  const clearError = useCallback(() => setError(null), []);

  return { isTest: false, view, connection, error, busy, dispatch, clearError, refresh, session: localSession };
}
