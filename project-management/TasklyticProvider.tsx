'use client'

/**
 * TasklyticProvider — hydrates stores and syncs Firebase auth user to Tasklytic user.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { usesTasklyticBackend } from './lib/forms/publicFormApi'
import { useAuth } from '@/contexts/AuthContext'
import { identify } from './lib/analytics/track'
import { now } from './lib/time'
import { ensureRecommendedFields } from './lib/customFields/seedRecommendedFields'
import { buildStarterContent } from './lib/provision'
import { hydrateTasklytic, rehydrateGlobalStores, rehydrateWorkspaceStores } from './stores/hydrate'
import { getRepository } from './lib/repository'
import { setActiveRepositoryWorkspaceId } from './lib/repository/workspaceScope'
import { OnboardingWizard } from './features/onboarding/OnboardingWizard'
import { ProductTour } from './features/onboarding/ProductTour'
import { registerOnboardingWizardStarter } from './features/onboarding/startOnboardingWizard'
import { TasklyticErrorBoundary } from './features/ui/TasklyticErrorBoundary'
import { TasklyticServiceUnavailable } from './features/ui/TasklyticServiceUnavailable'
import { useActivityHeartbeat } from './hooks/useActivityHeartbeat'
import { useAuthStore, useUiStore } from './stores/auth'
import {
  useGoalsStore,
  useNotificationsStore,
  usePortfoliosStore,
  useProjectsStore,
  useSectionsStore,
  useTasksStore,
  useTeamsStore,
  useUsersStore,
  useWorkspacesStore,
} from './stores/entities'
import './styles/tasklytic.css'

type Props = { children: ReactNode }

const AUTH_WAIT_MS = 5_000

function pickWorkspaceId(preferred: string | null, workspaces: { id: string }[]): string | null {
  const known = new Set(workspaces.map((w) => w.id))
  if (preferred && known.has(preferred)) return preferred
  return workspaces[0]?.id ?? null
}

export function TasklyticProvider({ children }: Props) {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const rawParam = typeof params?.workspaceId === 'string' ? params.workspaceId : null
  const routeWorkspaceId = rawParam === 'default' ? null : rawParam
  const { user: firebaseUser, loading: authLoading } = useAuth()
  const authUserId = firebaseUser?.uid ?? null
  const setupGenRef = useRef(0)
  const [bootReady, setBootReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [authWaitExpired, setAuthWaitExpired] = useState(false)
  const [bootAttempt, setBootAttempt] = useState(0)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const firstWorkspaceId = useWorkspacesStore((s) => {
    const rows = Object.values(s.items)
    if (!rows.length) return null
    return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? null
  })
  const resolvedWorkspaceId = activeWorkspaceId ?? firstWorkspaceId
  const effectiveWorkspaceId = routeWorkspaceId ?? resolvedWorkspaceId
  const tasklyticUser = useUsersStore((s) =>
    currentUserId ? s.items[currentUserId] : undefined
  )
  const showOnboarding = Boolean(
    tasklyticUser &&
      !tasklyticUser.onboarding?.completed &&
      !tasklyticUser.onboarding?.completedAt
  )
  const showTour = Boolean(
    tasklyticUser &&
      tasklyticUser.onboarding?.completed &&
      !tasklyticUser.onboarding?.tourCompletedAt
  )
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingReplay, setOnboardingReplay] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  const retryBoot = useCallback(() => {
    setBootReady(false)
    setBootError(null)
    setBootAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    registerOnboardingWizardStarter((opts) => {
      setOnboardingReplay(opts?.replay ?? false)
      setOnboardingOpen(true)
    })
    return () => registerOnboardingWizardStarter(null)
  }, [])

  useActivityHeartbeat()

  useEffect(() => {
    if (!authLoading) {
      setAuthWaitExpired(false)
      return
    }
    const timer = window.setTimeout(() => setAuthWaitExpired(true), AUTH_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [authLoading])

  useEffect(() => {
    if (showOnboarding) setOnboardingOpen(true)
  }, [showOnboarding])

  useEffect(() => {
    if (showTour) setTourOpen(true)
  }, [showTour])

  useEffect(() => {
    if (firebaseUser && currentUserId) {
      identify(currentUserId, { email: firebaseUser.email ?? undefined })
    }
  }, [firebaseUser, currentUserId])

  useEffect(() => {
    if (authLoading || !authUserId) return

    const userId = authUserId
    const setupGen = ++setupGenRef.current
    const stillActive = () => setupGen === setupGenRef.current

    async function provisionStarterWorkspace() {
      const bundle = buildStarterContent({
        userId,
        userName: firebaseUser!.displayName || firebaseUser!.email?.split('@')[0] || 'User',
        userEmail: firebaseUser!.email || '',
      })
      if (usesTasklyticBackend()) {
        const result = await getRepository().provision?.(bundle)
        const workspaceId = result?.workspace.id ?? bundle.workspace.id
        useUiStore.getState().setActiveWorkspaceId(workspaceId)
        setActiveRepositoryWorkspaceId(workspaceId)
        return workspaceId
      }
      await useWorkspacesStore.getState().add(bundle.workspace)
      useUiStore.getState().setActiveWorkspaceId(bundle.workspace.id)
      setActiveRepositoryWorkspaceId(bundle.workspace.id)
      await useUsersStore.getState().add(bundle.user)
      await useTeamsStore.getState().add(bundle.team)
      await useProjectsStore.getState().add(bundle.project)
      for (const section of bundle.sections) {
        await useSectionsStore.getState().add(section)
      }
      for (const task of bundle.tasks) {
        await useTasksStore.getState().add(task)
      }
      await useNotificationsStore.getState().add(bundle.notification)
      await useGoalsStore.getState().add(bundle.goal)
      await usePortfoliosStore.getState().add(bundle.portfolio)
      return bundle.workspace.id
    }

    async function setup() {
      setBootReady(false)
      setBootError(null)
      let workspaceId: string | null = null

      try {
        await hydrateTasklytic()
        if (!stillActive()) return

        const workspaces = useWorkspacesStore.getState().list()
        const preferred = routeWorkspaceId ?? useUiStore.getState().activeWorkspaceId
        workspaceId = pickWorkspaceId(preferred, workspaces)

        if (!workspaceId) {
          workspaceId = await provisionStarterWorkspace()
        } else {
          useUiStore.getState().setActiveWorkspaceId(workspaceId)
          setActiveRepositoryWorkspaceId(workspaceId)
        }

        if (!stillActive()) return

        if (workspaceId && usesTasklyticBackend()) {
          await rehydrateWorkspaceStores(workspaceId)
        }

        await useAuthStore.getState().setCurrentUser(userId)

        const users = useUsersStore.getState()
        const existingUser = users.getById(userId)
        const firebaseName = firebaseUser!.displayName || firebaseUser!.email?.split('@')[0] || 'User'
        const firebaseEmail = firebaseUser!.email || ''
        if (!existingUser) {
          await users.add({
            id: userId,
            name: firebaseName,
            email: firebaseEmail,
            avatarColor: '#cc785c',
            role: 'member',
            onboarding: {
              completed: true,
              completedSteps: [],
              completedAt: now(),
              tourCompletedAt: now(),
            },
            createdAt: now(),
          })
        } else if (existingUser.name !== firebaseName || existingUser.email !== firebaseEmail) {
          await users.update(userId, { name: firebaseName, email: firebaseEmail })
        }

        if (workspaceId && usesTasklyticBackend()) {
          void ensureRecommendedFields(workspaceId, userId).catch((err) => {
            console.warn('Tasklytic recommended fields seed skipped:', err)
          })
        }

        if (!workspaceId) {
          throw new Error(
            'No workspace is available. Check that the Tasklytic backend is running on port 8000.'
          )
        }
      } catch (err) {
        console.error('Tasklytic setup failed:', err)
        if (stillActive()) {
          setBootError(
            err instanceof Error
              ? err.message
              : 'Tasklytic could not load your workspace. Is the backend running?'
          )
        }
      } finally {
        if (stillActive()) setBootReady(true)
      }
    }

    void setup()
  }, [authLoading, authUserId, routeWorkspaceId, firebaseUser, bootAttempt])

  useEffect(() => {
    if (!bootReady || !resolvedWorkspaceId || !pathname) return
    if (pathname === '/dashboard/project-management' || pathname.includes('/w/default')) {
      router.replace(`/dashboard/project-management/w/${resolvedWorkspaceId}/home`)
    }
  }, [bootReady, pathname, resolvedWorkspaceId, router])

  useEffect(() => {
    if (authLoading || !usesTasklyticBackend() || !effectiveWorkspaceId || !bootReady) return
    setActiveRepositoryWorkspaceId(effectiveWorkspaceId)
    void rehydrateWorkspaceStores(effectiveWorkspaceId).catch((err) => {
      console.warn('Tasklytic workspace refresh failed:', err)
    })
  }, [authLoading, bootReady, effectiveWorkspaceId])

  useEffect(() => {
    if (!bootReady || !usesTasklyticBackend()) return
    let refreshing = false
    const refresh = async () => {
      if (refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        await rehydrateGlobalStores()
        const workspaceId = useUiStore.getState().activeWorkspaceId
        if (workspaceId) await rehydrateWorkspaceStores(workspaceId)
      } catch (err) {
        console.warn('Tasklytic refresh failed:', err)
      } finally {
        refreshing = false
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [bootReady])

  const waitingOnAuth = authLoading && !authWaitExpired

  if (waitingOnAuth) {
    return (
      <div className="tasklytic-root flex min-h-[320px] items-center justify-center">
        <p className="text-sm text-[var(--ink-muted)]">Loading project management…</p>
      </div>
    )
  }

  if (!bootReady) {
    return (
      <div className="tasklytic-root flex min-h-[320px] items-center justify-center">
        <p className="text-sm text-[var(--ink-muted)]">Loading your workspace…</p>
      </div>
    )
  }

  if (bootError) {
    return <TasklyticServiceUnavailable detail={bootError} onRetry={retryBoot} />
  }

  if (bootReady && !resolvedWorkspaceId) {
    return <TasklyticServiceUnavailable onRetry={retryBoot} />
  }

  return (
    <TasklyticErrorBoundary>
      {children}
      <OnboardingWizard
        open={onboardingOpen}
        onOpenChange={(open) => {
          setOnboardingOpen(open)
          if (!open) setOnboardingReplay(false)
        }}
        replay={onboardingReplay}
      />
      <ProductTour open={tourOpen} onOpenChange={setTourOpen} />
    </TasklyticErrorBoundary>
  )
}
