import { useSyncExternalStore } from 'react'
import { AppShell } from './components/shell/AppShell'
import { findNavItem } from './app/navigation'
import { useHashRoute } from './app/useHashRoute'
import { HomePage } from './features/home/HomePage'
import { PlaceholderPage } from './features/placeholder/PlaceholderPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { SchedulePage } from './features/schedule/SchedulePage'
import { FeedbackPage } from './features/feedback/FeedbackPage'
import { InboxPage } from './features/inbox/InboxPage'
import { QuotationPage } from './features/quotation/QuotationPage'
import { CloseoutPage } from './features/closeout/CloseoutPage'
import { FilesPage } from './features/files/FilesPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { createWorkspaceStore, selectHomeView, type WorkspaceStore } from './features/workspace/workspaceStore'

const defaultStore = createWorkspaceStore()

export function App({ store = defaultStore }: { store?: WorkspaceStore }) {
  const workspace = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const [route, navigate] = useHashRoute()
  const view = selectHomeView(workspace)
  const navItem = findNavItem(route)

  const pendingMessages = workspace.demo.feedbackBatches.reduce(
    (total, batch) => total + batch.items.filter((item) => item.status === 'NeedsClassification').length,
    0,
  )
  const pendingMails = workspace.demo.notificationDrafts.filter((draft) => draft.status === 'draft').length

  return (
    <AppShell
      route={route}
      onNavigate={navigate}
      pendingMessages={pendingMessages}
      pendingMails={pendingMails}
      onResetDemo={store.resetDemo}
    >
      {route === 'tasks' && (
        <HomePage
          workspace={workspace}
          view={view}
          onSelect={store.selectWorkItem}
          onNavigate={navigate}
        />
      )}
      {route === 'projects' && (
        <ProjectsPage workspace={workspace} store={store} onNavigate={navigate} />
      )}
      {route === 'schedule' && (
        <SchedulePage workspace={workspace} store={store} onNavigate={navigate} />
      )}
      {route === 'feedback' && (
        <FeedbackPage workspace={workspace} store={store} onNavigate={navigate} />
      )}
      {route === 'inbox' && <InboxPage workspace={workspace} store={store} onNavigate={navigate} />}
      {route === 'quotation' && (
        <QuotationPage workspace={workspace} store={store} onNavigate={navigate} />
      )}
      {route === 'closeout' && (
        <CloseoutPage workspace={workspace} store={store} onNavigate={navigate} />
      )}
      {route === 'files' && <FilesPage workspace={workspace} store={store} onNavigate={navigate} />}
      {route === 'analytics' && (
        <AnalyticsPage workspace={workspace} store={store} onNavigate={navigate} />
      )}
      {route === 'settings' && (
        <SettingsPage workspace={workspace} store={store} onNavigate={navigate} />
      )}
      {route !== 'tasks' &&
        route !== 'projects' &&
        route !== 'schedule' &&
        route !== 'feedback' &&
        route !== 'inbox' &&
        route !== 'quotation' &&
        route !== 'closeout' &&
        route !== 'files' &&
        route !== 'analytics' &&
        route !== 'settings' && <PlaceholderPage item={navItem} />}
    </AppShell>
  )
}

export default App
