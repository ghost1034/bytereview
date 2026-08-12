'use client'

/**
 * Route-aware guided product tour — runs after onboarding; replayable from Help.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GuidedTour, type GuidedTourStep } from '@/components/tour/guided-tour'
import { track } from '../../lib/analytics/track'
import { now } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { buildTourSteps } from './tourSteps'
import { registerProductTourStarter } from './productTourLauncher'
export { startProductTour } from './productTourLauncher'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProductTour({ open, onOpenChange }: Props) {
  const router = useRouter()
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const updateUser = useUsersStore((s) => s.update)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const firstProject = useProjectsStore((s) =>
    s.list().find((project) => project.workspaceId === workspaceId && !project.archived)
  )
  const firstTask = useTasksStore((s) =>
    s.list().find((task) => task.workspaceId === workspaceId)
  )
  const [tourReady, setTourReady] = useState(false)
  const originalHrefRef = useRef<string | null>(null)
  const lastTrackedStepRef = useRef<string | null>(null)

  const steps = useMemo(
    () =>
      workspaceId
        ? buildTourSteps({
            workspaceId,
            projectId: firstProject?.id,
            taskId: firstTask?.id,
          })
        : [],
    [firstProject?.id, firstTask?.id, workspaceId]
  )

  const complete = useCallback(async () => {
    if (currentUserId && user) {
      await updateUser(currentUserId, {
        onboarding: {
          ...user.onboarding,
          completedSteps: user.onboarding?.completedSteps ?? [],
          tourCompletedAt: now(),
        },
      })
    }
    track('product_tour_completed', {})
  }, [currentUserId, updateUser, user])

  useEffect(() => {
    registerProductTourStarter(() => {
      onOpenChange(true)
      track('product_tour_started', {})
    })
    return () => {
      registerProductTourStarter(null)
    }
  }, [onOpenChange])

  useEffect(() => {
    if (open) {
      if (!originalHrefRef.current) {
        originalHrefRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      }
      setTourReady(true)
      return
    }

    setTourReady(false)
    originalHrefRef.current = null
    lastTrackedStepRef.current = null
  }, [open])

  const handleStepChange = useCallback(
    (step: GuidedTourStep, stepIndex: number) => {
      if (!step.route) return
      const currentHref = `${window.location.pathname}${window.location.search}`
      if (currentHref !== step.route) router.replace(step.route, { scroll: false })

      if (lastTrackedStepRef.current !== step.id) {
        lastTrackedStepRef.current = step.id
        track('product_tour_step_viewed', {
          stepId: step.id,
          stepNumber: stepIndex + 1,
          section: step.section,
        })
      }
    },
    [router]
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const originalHref = originalHrefRef.current
        if (originalHref) router.replace(originalHref, { scroll: false })
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, router]
  )

  return (
    <GuidedTour
      open={open && tourReady && steps.length > 0}
      onOpenChange={handleOpenChange}
      steps={steps}
      onComplete={complete}
      onStepChange={handleStepChange}
      overlayProps={{
        layout: 'compact',
        rootClassName: 'z-[200]',
        backdropClassName: 'bg-black/30',
        highlightClassName: 'rounded-lg border-0 bg-transparent shadow-none ring-2 ring-[#cc785c]',
        panelClassName: 'tl-popover-surface max-h-[calc(100vh-2rem)] overflow-y-auto',
        primaryButtonClassName: 'border-0 bg-[#cc785c] text-white hover:bg-[#b05d40]',
        highlightPadding: 4,
        panelWidth: 400,
        panelHeight: 300,
        gap: 12,
        focusOnStep: true,
        blockInteraction: true,
        ariaModal: true,
      }}
    />
  )
}
