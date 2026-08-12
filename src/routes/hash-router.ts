import { useEffect, useState } from 'react'

export type AppRoute = 'dashboard' | 'submissions' | 'cfp' | 'cfp-builder' | 'reviews' | 'speakers' | 'crm' | 'deliverables' | 'agenda' | 'communications' | 'embeds' | 'portal' | 'event' | 'docs' | 'settings' | 'admin'

const validRoutes = new Set<AppRoute>(['dashboard', 'submissions', 'cfp', 'cfp-builder', 'reviews', 'speakers', 'crm', 'deliverables', 'agenda', 'communications', 'embeds', 'portal', 'event', 'docs', 'settings', 'admin'])

function currentRoute(): AppRoute {
  const route = window.location.hash.replace(/^#\/?/, '').split('/')[0] as AppRoute
  return validRoutes.has(route) ? route : 'dashboard'
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
