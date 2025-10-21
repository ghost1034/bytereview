'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Trash2, User } from 'lucide-react'
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
      
      // Call the delete account API
      await apiClient.deleteUserAccount()
      
      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted.",
        variant: "default"
      })
      
      // Sign out the user and redirect to home page
      setTimeout(() => {
        signOut()
        window.location.href = '/'
      }, 2000)
      
    } catch (error) {
      console.error('Failed to delete account:', error)
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive"
      })
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">
          Manage your account, billing, and application preferences
        </p>
      </div>
      
      <Tabs defaultValue="billing" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="billing">Billing & Usage</TabsTrigger>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-gray-900">{user?.email || 'Not available'}</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Account ID</label>
                <p className="text-gray-500 text-sm font-mono">{user?.uid || 'Not available'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Delete Account</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        Delete Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your account
                          and remove all your data from our servers.
                        </AlertDialogDescription>
                        <div className="mt-3">
                          <p className="text-sm text-muted-foreground mb-2">This includes:</p>
                          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
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
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Yes, delete my account
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}