'use client'

import { Trash2, User } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import BillingDashboard from '@/components/billing/BillingDashboard'
import SubscriptionManager from '@/components/subscription/SubscriptionManager'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()

  const handleDeleteAccount = async () => {
    try {
      const { apiClient } = await import('@/lib/api')
      await apiClient.deleteUserAccount()

      toast({
        title: 'Account deleted',
        description: 'Your account has been permanently deleted.',
      })

      setTimeout(() => {
        signOut()
        window.location.href = '/'
      }, 2000)
    } catch (error) {
      console.error('Failed to delete account:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete account. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your account, billing, and application preferences."
      />

      <Tabs defaultValue="billing" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="billing">Billing &amp; usage</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <BillingDashboard />
            </div>
            <div className="space-y-4">
              <SubscriptionManager />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="account" className="space-y-6">
          <Section
            variant="card"
            title={
              <span className="inline-flex items-center gap-2">
                <User className="size-4 text-foreground-muted" aria-hidden />
                Account information
              </span>
            }
          >
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="settings-email"
                  className="text-sm font-medium text-foreground-muted"
                >
                  Email
                </Label>
                <p
                  id="settings-email"
                  className="text-sm text-foreground"
                >
                  {user?.email || 'Not available'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="settings-uid"
                  className="text-sm font-medium text-foreground-muted"
                >
                  Account ID
                </Label>
                <p
                  id="settings-uid"
                  className="font-mono text-xs text-foreground-subtle"
                >
                  {user?.uid || 'Not available'}
                </p>
              </div>
            </div>
          </Section>

          <Section
            variant="card"
            title={
              <span className="text-destructive">Danger zone</span>
            }
            className="border-destructive/30"
          >
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                Delete account
              </h3>
              <p className="text-sm text-foreground-muted">
                Permanently delete your account and all associated data. This
                action cannot be undone.
              </p>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="size-4" aria-hidden />
                    Delete account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete
                      your account and remove all your data from our servers.
                    </AlertDialogDescription>
                    <div className="mt-3 space-y-2 text-sm text-foreground-muted">
                      <p>This includes:</p>
                      <ul className="list-inside list-disc space-y-1">
                        <li>All extraction jobs and results</li>
                        <li>Custom templates and field configurations</li>
                        <li>Billing history and subscription data</li>
                        <li>Account settings and preferences</li>
                      </ul>
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, delete my account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
