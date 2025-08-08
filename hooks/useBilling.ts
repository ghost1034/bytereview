/**
 * React Query hooks for billing and subscription management
 */
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export interface BillingAccount {
  user_id: string
  plan_code: string
  plan_display_name: string
  pages_included: number
  pages_used: number
  automations_limit: number
  automations_count: number
  overage_cents: number
  current_period_start?: string
  current_period_end?: string
  status: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
}

export interface UsageStats {
  pages_used: number
  pages_included: number
  pages_remaining: number
  automations_count: number
  automations_limit: number
  period_start?: string
  period_end?: string
  plan_code: string
  plan_display_name: string
}

export interface SubscriptionPlan {
  code: string
  display_name: string
  pages_included: number
  automations_limit: number
  overage_cents: number
  stripe_price_recurring_id?: string
  sort_order: number
}

export interface PlanLimits {
  plan_code: string
  plan_display_name: string
  pages: {
    used: number
    included: number
    remaining: number
    can_process_more: boolean
  }
  automations: {
    count: number
    limit: number
    can_enable_more: boolean
  }
  period: {
    start?: string
    end?: string
  }
}

/**
 * Hook to get billing account information
 */
export function useBillingAccount() {
  const { user } = useAuth()

  return useQuery<BillingAccount>({
    queryKey: ['billing-account', user?.uid],
    queryFn: async () => {
      const response = await fetch('/api/billing/account', {
        headers: {
          'Authorization': `Bearer ${await user?.getIdToken()}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch billing account')
      }
      
      return response.json()
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
    retry: 2
  })
}

/**
 * Hook to get current usage statistics
 */
export function useUsageStats() {
  const { user } = useAuth()

  return useQuery<UsageStats>({
    queryKey: ['usage-stats', user?.uid],
    queryFn: async () => {
      const response = await fetch('/api/billing/usage', {
        headers: {
          'Authorization': `Bearer ${await user?.getIdToken()}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch usage stats')
      }
      
      return response.json()
    },
    enabled: !!user,
    staleTime: 15 * 1000, // 15 seconds
    retry: 2
  })
}

/**
 * Hook to get available subscription plans
 */
export function useSubscriptionPlans() {
  return useQuery<SubscriptionPlan[]>({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const response = await fetch('/api/billing/plans')
      
      if (!response.ok) {
        throw new Error('Failed to fetch subscription plans')
      }
      
      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2
  })
}

/**
 * Hook to check current plan limits
 */
export function usePlanLimits() {
  const { user } = useAuth()

  return useQuery<PlanLimits>({
    queryKey: ['plan-limits', user?.uid],
    queryFn: async () => {
      const response = await fetch('/api/billing/limits/check', {
        headers: {
          'Authorization': `Bearer ${await user?.getIdToken()}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to check plan limits')
      }
      
      return response.json()
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
    retry: 2
  })
}

/**
 * Hook to create Stripe checkout session
 */
export function useCreateCheckoutSession() {
  const { toast } = useToast()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ plan_code, success_url, cancel_url }: {
      plan_code: string
      success_url: string
      cancel_url: string
    }) => {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user?.getIdToken()}`
        },
        body: JSON.stringify({ plan_code, success_url, cancel_url })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create checkout session')
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      window.location.href = data.checkout_url
    },
    onError: (error: Error) => {
      toast({
        title: 'Checkout Failed',
        description: error.message,
        variant: 'destructive'
      })
    }
  })
}

/**
 * Hook to create Stripe customer portal session
 */
export function useCreatePortalSession() {
  const { toast } = useToast()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ return_url }: { return_url: string }) => {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user?.getIdToken()}`
        },
        body: JSON.stringify({ return_url })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create portal session')
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      // Redirect to Stripe portal
      window.location.href = data.portal_url
    },
    onError: (error: Error) => {
      toast({
        title: 'Portal Access Failed',
        description: error.message,
        variant: 'destructive'
      })
    }
  })
}

/**
 * Hook to invalidate billing-related queries (useful after subscription changes)
 */
export function useInvalidateBillingQueries() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return () => {
    queryClient.invalidateQueries({ queryKey: ['billing-account', user?.uid] })
    queryClient.invalidateQueries({ queryKey: ['usage-stats', user?.uid] })
    queryClient.invalidateQueries({ queryKey: ['plan-limits', user?.uid] })
    queryClient.invalidateQueries({ queryKey: ['subscription-plans'] })
  }
}