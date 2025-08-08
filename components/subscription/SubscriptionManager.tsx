'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Calendar, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBillingAccount, useCreatePortalSession, useSubscriptionPlans } from "@/hooks/useBilling";
import SubscriptionModal from "./SubscriptionModal";

export default function SubscriptionManager() {
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const { toast } = useToast();
  
  const { data: billingAccount, isLoading, error } = useBillingAccount();
  const { data: plans } = useSubscriptionPlans();
  const createPortalSession = useCreatePortalSession();

  const handleManageSubscription = () => {
    if (!billingAccount?.stripe_customer_id) {
      toast({
        title: "No subscription found",
        description: "You don't have an active subscription to manage.",
        variant: "destructive",
      });
      return;
    }

    createPortalSession.mutate({
      return_url: window.location.href
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'past_due': return 'destructive';
      case 'canceled': return 'secondary';
      default: return 'secondary';
    }
  };

  const getPlanPrice = (planCode: string) => {
    const plan = plans?.find(p => p.code === planCode);
    if (!plan?.stripe_price_recurring_id) return null;
    
    switch (planCode) {
      case 'basic': return '$9.99';
      case 'pro': return '$49.99';
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Subscription</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <p className="text-gray-600">Loading subscription details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !billingAccount) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Subscription</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Unable to load subscription details</p>
        </CardContent>
      </Card>
    );
  }

  if (billingAccount.plan_code === "free") {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No Active Subscription</p>
              <p className="text-sm text-gray-500 mb-6">
                You're currently on the free plan ({billingAccount.pages_included} pages/month). Upgrade to unlock advanced features.
              </p>
              
              <Button 
                onClick={() => setIsSubscriptionModalOpen(true)}
                className="lido-green hover:lido-green-dark text-white"
              >
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>

        <SubscriptionModal 
          isOpen={isSubscriptionModalOpen} 
          onClose={() => setIsSubscriptionModalOpen(false)} 
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Active Subscription</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Status</span>
            <Badge variant={getStatusColor(subscriptionData.status)}>
              {subscriptionData.status === 'active' ? 'Active' : 
               subscriptionData.status === 'incomplete' ? 'Payment Pending' : 
               subscriptionData.status}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Plan</span>
            <span className="font-medium">{subscriptionData.plan}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-700">Page Limit</span>
            <span className="font-medium">
              {subscriptionData.pagesLimit === 999999 ? 'Unlimited' : subscriptionData.pagesLimit} pages/month
            </span>
          </div>

          {subscriptionData.amount && (
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Price</span>
              <span className="font-medium">
                ${subscriptionData.amount}/month
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Next billing</span>
            <div className="flex items-center space-x-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm">{subscriptionData.nextBilling}</span>
            </div>
          </div>



          {subscriptionData.subscriptionId && subscriptionData.status === 'active' && (
            <div className="pt-4 border-t">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full text-red-600 border-red-200 hover:bg-red-50"
                    disabled={isCancelling}
                  >
                    {isCancelling ? "Cancelling..." : "Cancel Subscription"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel your subscription? You'll lose access to premium features at the end of your current billing period.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleCancelSubscription}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Yes, Cancel
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      <SubscriptionModal 
        isOpen={isSubscriptionModalOpen} 
        onClose={() => setIsSubscriptionModalOpen(false)} 
      />
    </>
  );
}