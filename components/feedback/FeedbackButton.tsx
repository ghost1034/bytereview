'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { components } from '@/lib/api-types'
import { useBillingAccount, useInvalidateBillingQueries } from '@/hooks/useBilling'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function FeedbackButton() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Give feedback" className="shrink-0">
          <MessageSquare className="size-4" aria-hidden />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      </DialogTrigger>
      {open && <FeedbackForm />}
    </Dialog>
  )
}

function FeedbackForm() {
  const [message, setMessage] = useState('')
  const requestId = useRef<string | null>(null)
  const { data: account } = useBillingAccount()
  const invalidateBilling = useInvalidateBillingQueries()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => {
      requestId.current ??= crypto.randomUUID()
      return apiClient.request<components['schemas']['FeedbackResponse']>('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          request_id: requestId.current,
          message: message.trim(),
          page_path: window.location.pathname,
        } satisfies components['schemas']['FeedbackRequest']),
      })
    },
    onSuccess: () => {
      invalidateBilling()
      // Product entitlement/storage queries may also depend on the rewarded plan.
      void queryClient.invalidateQueries()
    },
  })
  const nextReward = account?.feedback_reward_available_at
  const alreadyRewarded = nextReward && new Date(nextReward).getTime() > Date.now()
  const rewardText = alreadyRewarded
    ? `You have earned this month's reward. Your next reward is available ${new Date(nextReward).toLocaleDateString()}. You can still share feedback anytime.`
    : account?.plan_code === 'free'
      ? 'Submit feedback to get one month of Basic free. No payment method required; you return to Free when it ends.'
      : account
        ? 'Submit feedback to reset your page and AI token usage for this billing month. Storage stays unchanged.'
        : 'Earn one month of Basic on Free, or a page and AI token usage reset on a paid plan. Storage is excluded from resets.'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (message.trim() && !mutation.isPending) mutation.mutate()
  }

  const result = mutation.data
  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{result ? 'Thank you for your feedback' : 'Help improve CPAAutomation'}</DialogTitle>
        <DialogDescription>
          {result ? 'Your feedback has been saved.' : 'Tell us what works, what could be better, or what you would like us to build.'}
        </DialogDescription>
      </DialogHeader>
      {result ? (
        <p role="status" className="rounded-lg bg-primary-soft p-4 text-sm text-primary-soft-foreground">
          {result.reward === 'basic_month'
            ? `Basic is now free until ${new Date(result.basic_until!).toLocaleDateString()}. You will return to Free automatically, with no charge.`
            : result.reward === 'usage_reset'
              ? 'Your page and AI token usage has been reset. Storage is unchanged. Your billing date stays the same.'
              : `You have already earned this month's reward. Your next reward is available ${new Date(result.next_reward_at!).toLocaleDateString()}.`}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-surface-muted p-3 text-sm text-foreground-muted">
            <p>{rewardText}</p>
            {!alreadyRewarded && <p className="mt-1">One reward per billing month.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="feedback-message">Your feedback</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                requestId.current = null
              }}
              placeholder="Share your experience or an idea…"
              rows={5}
              maxLength={5000}
              required
              disabled={mutation.isPending}
            />
            <p className="text-right text-xs text-foreground-muted">{message.length.toLocaleString()} / 5,000</p>
          </div>
          {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
          <Button type="submit" className="w-full" disabled={!message.trim() || mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {mutation.isPending ? 'Submitting…' : 'Submit feedback'}
          </Button>
        </form>
      )}
    </DialogContent>
  )
}
