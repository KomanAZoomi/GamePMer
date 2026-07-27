import { useSyncExternalStore } from 'react'
import { AppShell } from './components/shell/AppShell'
import { findNavItem } from './app/navigation'
import { useHashRoute } from './app/useHashRoute'
import { HomePage } from './features/home/HomePage'
import { PlaceholderPage } from './features/placeholder/PlaceholderPage'
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
      {route === 'tasks' ? (
        <HomePage
          workspace={workspace}
          view={view}
          onSelect={store.selectWorkItem}
          onNavigate={navigate}
        />
      ) : (
        <PlaceholderPage item={navItem} />
      )}
    </AppShell>
  )
}

export default App
