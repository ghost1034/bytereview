'use client'

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/auth/AuthModal";
import { useSubscriptionPlans, useCreateCheckoutSession } from "@/hooks/useBilling";
import UsageStats from "@/components/subscription/UsageStats";

export default function Pricing() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string>("");
  const { user } = useAuth();
  const { data: plans, isLoading } = useSubscriptionPlans();
  const createCheckoutSession = useCreateCheckoutSession();

  // Handle post-authentication checkout
  useEffect(() => {
    if (user && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const planParam = urlParams.get('plan');
      const checkoutParam = urlParams.get('checkout');
      
      if (planParam && checkoutParam === 'true') {
        // Clear the URL parameters
        window.history.replaceState({}, '', '/pricing');
        
        // Trigger checkout for the specified plan
        createCheckoutSession.mutate({
          plan_code: planParam,
          success_url: `${window.location.origin}/dashboard?success=true`,
          cancel_url: `${window.location.origin}/pricing`
        });
      }
    }
  }, [user, createCheckoutSession]);

  const getPlanPrice = (planCode: string) => {
    switch (planCode) {
      case 'basic': return '$9.99';
      case 'pro': return '$49.99';
      default: return 'Free';
    }
  };

  const getPlanFeatures = (planCode: string, pagesIncluded: number, automationsLimit: number) => {
    const baseFeatures = [
      `${pagesIncluded === 999999 ? 'Unlimited' : pagesIncluded.toLocaleString()} ${pagesIncluded === 1 ? 'page' : 'pages'} per month`,
      `Up to ${automationsLimit} ${automationsLimit === 1 ? 'automation' : 'automations'}`,
      'Custom extraction templates',
      'Export to CSV, Excel, Google Sheets'
    ];

    if (planCode === 'free') {
      return [
        ...baseFeatures,
        'Community support',
        'Standard processing speed'
      ];
    } else if (planCode === 'basic') {
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

  const handleGetStarted = (planCode: string) => {
    if (!user) {
      // Set up the redirect URL for after authentication
      const redirectUrl = planCode === 'free' 
        ? '/dashboard' 
        : `/pricing?plan=${planCode}&checkout=true`;
      
      setPendingPlan(redirectUrl);
      setIsAuthModalOpen(true);
    } else {
      if (planCode === 'free') {
        // Free plan - redirect to dashboard
        window.location.href = '/dashboard';
      } else {
        // Paid plan - create checkout session
        createCheckoutSession.mutate({
          plan_code: planCode,
          success_url: `${window.location.origin}/dashboard?success=true`,
          cancel_url: `${window.location.origin}/pricing`
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">Pricing for teams of every size</h1>
            <p className="text-xl text-gray-600">All plans are available month-to-month and you can cancel at any time.</p>
          </div>
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600">Loading plans...</span>
          </div>
        </div>
      </div>
    );
  }

  // Sort plans by sort_order
  const sortedPlans = [...(plans || [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Pricing for teams of every size</h1>
          <p className="text-xl text-gray-600">All plans are available month-to-month and you can cancel at any time.</p>
        </div>
        
        {user && (
          <div className="flex justify-center mb-10">
            <UsageStats />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {sortedPlans.map((plan) => (
            <Card 
              key={plan.code}
              className={`border hover:shadow-lg transition-shadow ${
                plan.code === 'pro' 
                  ? 'border-2 border-green-500 relative transform scale-105 shadow-lg' 
                  : 'border-gray-200'
              }`}
            >
              {plan.code === 'pro' && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold">Most Popular</span>
                </div>
              )}
              
              <CardContent className="p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.display_name}</h3>
                <p className="text-gray-600 mb-6">
                  {plan.code === 'free' ? 'Get started for free' : 
                   plan.code === 'basic' ? 'For individuals and small teams' :
                   'For growing finance teams'}
                </p>
                
                <div className="mb-2">
                  <span className="text-4xl font-bold text-gray-900">{getPlanPrice(plan.code)}</span>
                  {plan.code !== 'free' && <span className="text-gray-600"> / month</span>}
                </div>
                <div className="mb-6 text-sm text-gray-600">
                  {plan.overage_cents > 0 
                    ? (
                      <>Overage: {(plan.overage_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} per page</>
                    ) : (
                      <>No overage allowed</>
                    )}
                </div>
                
                <ul className="space-y-3 mb-8">
                  {getPlanFeatures(plan.code, plan.pages_included, plan.automations_limit).map((feature, index) => (
                    <li key={index} className="flex items-center space-x-2">
                      <Check className="text-green-500 w-4 h-4" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  className="w-full lido-green hover:lido-green-dark text-white"
                  onClick={() => handleGetStarted(plan.code)}
                  disabled={createCheckoutSession.isPending}
                >
                  {createCheckoutSession.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    plan.code === 'free' ? 'Get Started Free' : 'Get Started'
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <section className="py-20 bg-gray-50 mt-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Can I cancel my subscription at any time?</h3>
                <p className="text-gray-600">Yes, you can cancel your subscription at any time. There are no long-term contracts or cancellation fees.</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">How does overage pricing work?</h3>
                <p className="text-gray-600">Paid plans include a monthly page allotment. If a plan includes overage, additional pages are billed at the overage rate shown on the plan card. Free plans do not allow overage. You’ll see your usage in the dashboard so you can track and manage spending.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Do you offer annual billing or discounts?</h3>
                <p className="text-gray-600">Yes. We can provide annual billing and volume discounts for teams with higher usage. Contact us if you’re interested in annual pricing or custom plans.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">What happens if I upgrade or downgrade?</h3>
                <p className="text-gray-600">Plan changes take effect immediately. If you upgrade, you get access to the higher plan’s limits right away. If you downgrade, new limits apply immediately and your next bill will reflect the new plan.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        redirectTo={pendingPlan}
      />

    </div>
  );
}
