import type { Action } from '@shared/engine';
import type { PlayerView } from '@shared/types';

/**
 * 房间内各视图的统一入参。
 *
 * 线上房间与单人测试模式传入的是同一套 props，
 * 因此所有界面组件在两种模式下完全复用。
 */
export interface ViewProps {
  view: PlayerView;
  dispatch: (action: Action) => Promise<void>;
  busy: boolean;
  isTest: boolean;
}
