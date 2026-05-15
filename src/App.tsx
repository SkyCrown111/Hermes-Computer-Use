import './styles/globals.css';
import { useEffect, Suspense, lazy, useState } from 'react';
import { useNavigationStore, useThemeStore, useSessionStore, resolveTheme } from './stores';
import { initializeChatStore } from './stores/chatStore';
import { ensureChatStreamBridge, teardownChatStreamBridge } from './lib/chatStreamBridge';
import { Layout, ToastContainer, ErrorBoundary } from './components';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTranslation } from './hooks/useTranslation';

// Lazy-loaded page components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Skills = lazy(() => import('./pages/Skills').then(m => ({ default: m.Skills })));
const CronJobs = lazy(() => import('./pages/CronJobs').then(m => ({ default: m.CronJobs })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Monitor = lazy(() => import('./pages/Monitor').then(m => ({ default: m.Monitor })));
const Memory = lazy(() => import('./pages/Memory').then(m => ({ default: m.Memory })));
const Platforms = lazy(() => import('./pages/Platforms').then(m => ({ default: m.Platforms })));
const Profiles = lazy(() => import('./pages/Profiles').then(m => ({ default: m.Profiles })));
const Files = lazy(() => import('./pages/Files').then(m => ({ default: m.Files })));
const ChatPageLazy = lazy(() => import('./pages/Chat').then(m => ({ default: m.ChatPage })));
const Preferences = lazy(() => import('./pages/Preferences').then(m => ({ default: m.Preferences })));
const Gateway = lazy(() => import('./pages/Gateway').then(m => ({ default: m.Gateway })));
const MCP = lazy(() => import('./pages/MCP').then(m => ({ default: m.MCP })));
const Tools = lazy(() => import('./pages/Tools').then(m => ({ default: m.Tools })));
const KanbanPage = lazy(() => import('./pages/Kanban').then(m => ({ default: m.KanbanPage })));
const HelpGuidePage = lazy(() => import('./pages/HelpGuide').then(m => ({ default: m.HelpGuidePage })));
const CommandPalette = lazy(() => import('./components/ui/CommandPalette').then(m => ({ default: m.CommandPalette })));
const GlobalSearch = lazy(() => import('./components/ui/GlobalSearch').then(m => ({ default: m.GlobalSearch })));

// Suspense fallback with i18n
const PageFallback: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 300,
        gap: 'var(--space-3)',
      }}
    >
      <div className="loading-spinner" />
      <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
        {t('loading.loading')}
      </span>
    </div>
  );
};

function App() {
  const activeItem = useNavigationStore(s => s.activeItem);
  const chatContext = useNavigationStore(s => s.chatContext);
  const restoreTabs = useNavigationStore(s => s.restoreTabs);
  const mode = useThemeStore(s => s.mode);
  const displayPreferences = useThemeStore(s => s.displayPreferences);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const [overlayUiReady, setOverlayUiReady] = useState(false);

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  // Apply theme and display preferences to document
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      root.setAttribute('data-theme', resolveTheme(mode));
    };

    applyTheme();

    if (mode === 'system' && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }

    return;
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    // Apply compact mode
    root.classList.toggle('compact-mode', displayPreferences.compactMode);
    // Apply sidebar position
    root.setAttribute('data-sidebar-position', displayPreferences.sidebarPosition);
  }, [displayPreferences.compactMode, displayPreferences.sidebarPosition]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    const supportsIdleCallback = typeof window.requestIdleCallback === 'function';

    const markReady = () => {
      if (!cancelled) setOverlayUiReady(true);
    };

    if (supportsIdleCallback) {
      idleId = window.requestIdleCallback(() => markReady(), { timeout: 1500 });
    } else {
      timeoutId = globalThis.setTimeout(markReady, 300);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, []);

  // Global chat stream listeners (survive page navigation)
  useEffect(() => {
    void ensureChatStreamBridge();
    return () => {
      teardownChatStreamBridge();
    };
  }, []);

  // Restore tabs and fetch sessions on mount
  useEffect(() => {
    initializeChatStore();

    restoreTabs().then(() => {
      fetchSessions();
    });
  }, [fetchSessions, restoreTabs]);

  // Simple page routing based on navigation state
  const renderPage = () => {
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
        case 'profiles':
          return <Profiles key="profiles" />;
        case 'files':
          return <Files key="files" />;
        case 'gateway':
          return <Gateway key="gateway" />;
        case 'mcp':
          return <MCP key="mcp" />;
        case 'tools':
          return <Tools key="tools" />;
        case 'kanban':
          return <KanbanPage key="kanban" />;
        case 'preferences':
          return <Preferences key="preferences" />;
        case 'help':
          return <HelpGuidePage key="help" />;
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
      {overlayUiReady ? (
        <Suspense fallback={null}>
          <CommandPalette />
          <GlobalSearch />
        </Suspense>
      ) : null}
    </>
  );
}

export default App;
