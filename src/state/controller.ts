import type { Action } from '@shared/engine';
import type { PlayerView } from '@shared/types';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface ControllerError {
  code: string;
  params: Record<string, string | number> | null;
}

/**
 * 房间控制器接口。
 *
 * 线上房间（WebSocket + REST）与单人测试模式（本地引擎）都实现这个接口，
 * 因此所有页面组件完全复用，测试模式跑的是同一套 UI 与同一套规则。
 */
export interface RoomController {
  readonly isTest: boolean;
  readonly view: PlayerView | null;
  readonly connection: ConnectionState;
  readonly error: ControllerError | null;
  readonly busy: boolean;
  dispatch: (action: Action) => Promise<void>;
  clearError: () => void;
  refresh: () => void;
}
