import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { ConfirmProvider } from './components/ui';
import { useTheme } from './state/theme';
import Home from './pages/Home';
import Create from './pages/Create';
import Join from './pages/Join';
import Room from './pages/Room';
import Test from './pages/Test';
import NotFound from './pages/NotFound';
import './styles/global.css';

function Root(): JSX.Element {
  // 在根上应用主题，保证整个应用（含在线房间与测试模式）使用同一份外观偏好。
  useTheme();
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create" element={<Create />} />
      <Route path="/join" element={<Join />} />
      <Route path="/room" element={<Room />} />
      <Route path="/test" element={<Test />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('root container missing');

createRoot(container).render(
  <I18nProvider>
    <ConfirmProvider>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </ConfirmProvider>
  </I18nProvider>,
);
