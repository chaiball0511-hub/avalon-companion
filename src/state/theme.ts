import { useEffect, useState } from 'react';
import { loadTheme, saveTheme, type ThemeMode } from './session';

/**
 * 主题 Hook：把当前主题写到 <html data-theme> 上（CSS 据此切换深浅色），
 * 同时持久化到 localStorage。在线房间与测试模式都复用同一份偏好。
 */
export function useTheme(): [ThemeMode, (next: ThemeMode) => void] {
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    saveTheme(next);
  };

  return [theme, setTheme];
}
