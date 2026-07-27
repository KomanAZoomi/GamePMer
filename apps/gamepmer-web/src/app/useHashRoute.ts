import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_ROUTE, isRouteKey, type RouteKey } from './navigation'

/**
 * 轻量 hash 路由。
 *
 * 内网工作台只需要「刷新后停在同一页」和「可分享的页内链接」，
 * 为此引入路由库不划算——一个依赖在内网部署时就是一份额外的审查成本。
 */

function readHash(): RouteKey {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return isRouteKey(raw) ? raw : DEFAULT_ROUTE
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

export function useHashRoute(): [RouteKey, (key: RouteKey) => void] {
  const route = useSyncExternalStore(subscribe, readHash, () => DEFAULT_ROUTE)
  const navigate = useCallback((key: RouteKey) => {
    window.location.hash = `#/${key}`
  }, [])
  return [route, navigate]
}
