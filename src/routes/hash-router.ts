import { useEffect, useState } from 'react'

export type AppRoute = 'welcome' | 'dashboard' | 'submissions' | 'cfp' | 'cfp-builder' | 'reviews' | 'speakers' | 'crm' | 'deliverables' | 'agenda' | 'communications' | 'history' | 'embeds' | 'portal' | 'event' | 'docs' | 'settings' | 'admin'

const validRoutes = new Set<AppRoute>(['welcome', 'dashboard', 'submissions', 'cfp', 'cfp-builder', 'reviews', 'speakers', 'crm', 'deliverables', 'agenda', 'communications', 'history', 'embeds', 'portal', 'event', 'docs', 'settings', 'admin'])

export function routeFromHash(hash: string): AppRoute {
  const route = hash.replace(/^#\/?/, '').split('/')[0] as AppRoute
  if (!route) return 'welcome'
  return validRoutes.has(route) ? route : 'dashboard'
}

function currentRoute(): AppRoute {
  return routeFromHash(window.location.hash)
}

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(currentRoute)
  useEffect(() => {
    const update = () => {
      setRoute(currentRoute())
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  function navigate(next: string) {
    window.location.hash = `/${validRoutes.has(next as AppRoute) ? next : 'dashboard'}`
  }
  return { route, navigate }
}
