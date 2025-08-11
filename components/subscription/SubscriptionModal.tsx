import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionPlans, useCreateCheckoutSession } from "@/hooks/useBilling";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const { user } = useAuth();
  const { data: plans, isLoading } = useSubscriptionPlans();
  const createCheckoutSession = useCreateCheckoutSession();

  const getPlanPrice = (planCode: string) => {
    switch (planCode) {
      case 'basic': return '$9.99';
      case 'pro': return '$49.99';
      default: return 'Free';
    }
  };

  const getPlanFeatures = (planCode: string, pagesIncluded: number, automationsLimit: number) => {
    const baseFeatures = [
      `${pagesIncluded === 999999 ? 'Unlimited' : pagesIncluded} pages per month`,
      `Up to ${automationsLimit} automations`,
      'Custom extraction templates',
      'Export to CSV, Excel, Google Sheets'
    ];

    if (planCode === 'basic') {
      return [
        ...baseFeatures,
        'Email support',
        'Standard processing speed'
      ];
    } else if (planCode === 'pro') {
      return [
        ...baseFeatures,
        'Priority support',
        'Fast processing speed',
        'API access',
        'Advanced integrations'
      ];
    }

    return baseFeatures;
  };

  const handleSelectPlan = (planCode: string) => {
    if (!user) {
      onClose();
      return;
    }

    createCheckoutSession.mutate({
      plan_code: planCode,
      success_url: `${window.location.origin}/dashboard?success=true`,
      cancel_url: `${window.location.origin}/pricing`
    });
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold">
              Choose Your Plan
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600">Loading plans...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Filter to only paid plans (basic and pro)
  const paidPlans = plans?.filter(plan => plan.code !== 'free') || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            Choose Your Plan
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6 py-4">
          {paidPlans.map((plan, index) => (
            <div 
              key={plan.code}
              className={`border rounded-lg p-6 ${
                plan.code === 'pro' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
              }`}
            >
              {plan.code === 'pro' && (
                <div className="bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full text-center mb-4">
                  MOST POPULAR
                </div>
              )}
              
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{plan.display_name}</h3>
                <div className="text-3xl font-bold text-gray-900">{getPlanPrice(plan.code)}</div>
                <div className="text-gray-600 text-sm">per month</div>
              </div>

              <div className="space-y-3 mb-6">
                {getPlanFeatures(plan.code, plan.pages_included, plan.automations_limit).map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-center text-sm">
                    <Check className="w-4 h-4 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>

              <Button 
                onClick={() => handleSelectPlan(plan.code)}
                disabled={createCheckoutSession.isPending}
                className={`w-full ${
                  plan.code === 'pro'
                    ? 'lido-green hover:lido-green-dark text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                {createCheckoutSession.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Get Started
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>

        <div className="text-center pt-4 border-t">
          <p className="text-sm text-gray-600">
            All plans include automatic billing • Cancel anytime
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}