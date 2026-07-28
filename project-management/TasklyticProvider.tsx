'use client'

/**
 * TasklyticProvider — hydrates stores and syncs Firebase auth user to Tasklytic user.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { usesTasklyticBackend } from './lib/forms/publicFormApi'
import { useAuth } from '@/contexts/AuthContext'
import { identify } from './lib/analytics/track'
import { ensureRecommendedFields } from './lib/customFields/seedRecommendedFields'
import { buildStarterContent } from './lib/provision'
import { hydrateTasklytic, rehydrateWorkspaceStores } from './stores/hydrate'
import { setActiveRepositoryWorkspaceId } from './lib/repository/workspaceScope'
import { OnboardingWizard } from './features/onboarding/OnboardingWizard'
import { ProductTour } from './features/onboarding/ProductTour'
import { registerOnboardingWizardStarter } from './features/onboarding/startOnboardingWizard'
import { TasklyticErrorBoundary } from './features/ui/TasklyticErrorBoundary'
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

        await useAuthStore.getState().setCurrentUser(userId, { partition: 'default' })

        if (workspaceId && usesTasklyticBackend()) {
          await rehydrateWorkspaceStores(workspaceId)
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
    if (pathname === '/dashboard/tasklytic' || pathname.includes('/w/default')) {
      router.replace(`/dashboard/tasklytic/w/${resolvedWorkspaceId}/home`)
    }
  }, [bootReady, pathname, resolvedWorkspaceId, router])

  useEffect(() => {
    if (authLoading || !usesTasklyticBackend() || !effectiveWorkspaceId || !bootReady) return
    setActiveRepositoryWorkspaceId(effectiveWorkspaceId)
    void rehydrateWorkspaceStores(effectiveWorkspaceId)
  }, [authLoading, bootReady, effectiveWorkspaceId])

  const waitingOnAuth = authLoading && !authWaitExpired

  if (waitingOnAuth) {
    return (
      <div className="tasklytic-root flex min-h-[320px] items-center justify-center">
        <p className="text-sm text-[var(--ink-muted)]">Loading Tasklytic…</p>
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

  if (bootReady && !resolvedWorkspaceId) {
    return (
      <div className="tasklytic-root flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-destructive">
          {bootError ??
            'Tasklytic could not load a workspace. Confirm the backend is running on port 8000 (only one instance).'}
        </p>
        <button
          type="button"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
          onClick={retryBoot}
        >
          Retry
        </button>
      </div>
    )
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
