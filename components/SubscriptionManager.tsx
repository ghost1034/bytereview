import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CreditCard, Calendar, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SubscriptionModal from "./SubscriptionModal";

interface SubscriptionData {
  plan: string;
  pagesUsed: number;
  pagesLimit: number;
  nextBilling: string;
  status: string;
  subscriptionId: string | null;
  amount?: number;
  currency?: string;
}

export default function SubscriptionManager() {
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    try {
      const response = await fetch('/api/subscription-status');
      if (response.ok) {
        const data = await response.json();
        setSubscriptionData(data);
      }
    } catch (error) {
      console.error('Error fetching subscription data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscriptionData?.subscriptionId) return;

    setIsCancelling(true);
    try {
      const response = await apiRequest("POST", "/api/cancel-subscription", {
        subscriptionId: subscriptionData.subscriptionId,
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Subscription Cancelled",
          description: data.message,
        });
        fetchSubscriptionData();
      } else {
        throw new Error(data.error || "Failed to cancel subscription");
      }
    } catch (error: any) {
      toast({
        title: "Cancellation Failed",
        description: error.message || "Unable to cancel subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'canceled':
        return 'secondary';
      case 'past_due':
        return 'destructive';
      case 'incomplete':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Loading subscription details...</p>
        </CardContent>
      </Card>
    );
  }

  if (!subscriptionData || subscriptionData.plan === "Free") {
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
                You're currently on the free plan ({subscriptionData?.pagesLimit || 10} pages/month). Upgrade to unlock advanced features.
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