import './styles/globals.css';
import { Dashboard, Sessions, Skills, CronJobs, Settings, Monitor, Memory, Platforms, Files, ChatPage, Preferences } from './pages';
import { useNavigationStore, useThemeStore } from './stores';
import { Layout } from './components/layout';
import { useEffect } from 'react';
import { logger } from './lib/logger';

function App() {
  const { activeItem, chatContext } = useNavigationStore();
  const { mode } = useThemeStore();
  logger.component('App', 'Active item:', activeItem, 'Chat context:', chatContext);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  // Simple page routing based on navigation state
  const renderPage = () => {
    logger.component('App', 'Rendering page for:', activeItem);
    switch (activeItem) {
      case 'sessions':
        return <Sessions />;
      case 'skills':
        return <Skills />;
      case 'tasks':
        return <CronJobs />;
      case 'settings':
        return <Settings />;
      case 'monitor':
        return <Monitor />;
      case 'memory':
        return <Memory />;
      case 'platforms':
        return <Platforms />;
      case 'files':
        return <Files />;
      case 'preferences':
        return <Preferences />;
      case 'chat':
        return (
          <ChatPage
            sessionId={chatContext?.sessionId}
            sessionTitle={chatContext?.sessionTitle}
          />
        );
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  };

  return <Layout>{renderPage()}</Layout>;
}

export default App;
