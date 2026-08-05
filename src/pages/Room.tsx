import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSession, clearSession } from '../state/session';
import { useOnlineRoom } from '../state/useOnlineRoom';
import { RoomShell } from '../room/RoomShell';

/** 线上房间：用本地会话驱动实时房间控制器，交给 RoomShell 统一渲染。 */
export default function Room(): JSX.Element {
  const navigate = useNavigate();
  const session = loadSession();
  const controller = useOnlineRoom(session);

  useEffect(() => {
    if (!session) navigate('/', { replace: true });
  }, [session, navigate]);

  if (!session) return <></>;

  const leave = () => {
    clearSession();
    navigate('/', { replace: true });
  };

  return <RoomShell controller={controller} isTest={false} onLeave={leave} />;
}
