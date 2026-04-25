import './styles/globals.css';
import { useEffect, Suspense, lazy } from 'react';
import { useNavigationStore, useThemeStore, useSessionStore } from './stores';
import { initializeChatStore } from './stores/chatStore';
import { Layout, ToastContainer, ErrorBoundary, CommandPalette, GlobalSearch } from './components';
import { logger } from './lib/logger';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Lazy-loaded page components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Skills = lazy(() => import('./pages/Skills').then(m => ({ default: m.Skills })));
const CronJobs = lazy(() => import('./pages/CronJobs').then(m => ({ default: m.CronJobs })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Monitor = lazy(() => import('./pages/Monitor').then(m => ({ default: m.Monitor })));
const Memory = lazy(() => import('./pages/Memory').then(m => ({ default: m.Memory })));
const Platforms = lazy(() => import('./pages/Platforms').then(m => ({ default: m.Platforms })));
const Files = lazy(() => import('./pages/Files').then(m => ({ default: m.Files })));
const ChatPageLazy = lazy(() => import('./pages/Chat').then(m => ({ default: m.ChatPage })));
const Preferences = lazy(() => import('./pages/Preferences').then(m => ({ default: m.Preferences })));
const Gateway = lazy(() => import('./pages/Gateway').then(m => ({ default: m.Gateway })));

// Suspense fallback
const PageFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
    <div className="loading-spinner" />
  </div>
);

function App() {
  const { activeItem, chatContext, restoreTabs } = useNavigationStore();
  const { mode } = useThemeStore();
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  logger.component('App', 'Active item:', activeItem, 'Chat context:', chatContext);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  // Restore tabs and fetch sessions on mount
  useEffect(() => {
    // Initialize chat store with persisted messages first
    initializeChatStore();

    // Restore tabs first (from localStorage)
    restoreTabs().then(() => {
      // Then fetch sessions list (will also check for missing sessions from open tabs)
      fetchSessions();
    });
  }, [fetchSessions, restoreTabs]);

  // Simple page routing based on navigation state
  const renderPage = () => {
    logger.component('App', 'Rendering page for:', activeItem);
    const page = (() => {
      switch (activeItem) {
        case 'sessions':
          return <Sessions key="sessions" />;
        case 'skills':
          return <Skills key="skills" />;
        case 'tasks':
          return <CronJobs key="tasks" />;
        case 'settings':
          return <Settings key="settings" />;
        case 'monitor':
          return <Monitor key="monitor" />;
        case 'memory':
          return <Memory key="memory" />;
        case 'platforms':
          return <Platforms key="platforms" />;
        case 'files':
          return <Files key="files" />;
        case 'gateway':
          return <Gateway key="gateway" />;
        case 'preferences':
          return <Preferences key="preferences" />;
        case 'chat':
          return <ChatPageLazy key="chat" sessionId={chatContext?.sessionId} />;
        case 'dashboard':
        default:
          return <Dashboard key="dashboard" />;
      }
    })();
    return (
      <ErrorBoundary key={`eb-${activeItem}`} inline>
        <Suspense fallback={<PageFallback />}>{page}</Suspense>
      </ErrorBoundary>
    );
  };

  return (
    <>
      <Layout>{renderPage()}</Layout>
      <ToastContainer />
      <CommandPalette />
      <GlobalSearch />
    </>
  );
}

export default App;
