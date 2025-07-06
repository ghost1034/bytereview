'use client'

import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
  throw new Error('Missing required Stripe key: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
}
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

const SubscribeForm = ({ plan }: { plan: any }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Subscription Created",
          description: `Welcome to ${plan.name}! Your subscription is now active.`,
        });
      }
    } catch (error) {
      toast({
        title: "Payment Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">{plan.name} Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-6">
            <div className="text-3xl font-bold text-gray-900">{plan.price}</div>
            <div className="text-gray-600">per month</div>
          </div>
          <div className="space-y-2 mb-6">
            {plan.features.map((feature: string, index: number) => (
              <div key={index} className="flex items-center text-sm text-gray-600">
                <Check className="w-4 h-4 text-green-500 mr-2" />
                {feature}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <PaymentElement />
        <Button 
          type="submit" 
          disabled={!stripe || isLoading} 
          className="w-full lido-green hover:lido-green-dark text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            `Subscribe to ${plan.name}`
          )}
        </Button>
      </form>
    </div>
  );
};

export default function Subscribe() {
  const [clientSecret, setClientSecret] = useState("");
  const [plan, setPlan] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Get plan from URL params or default to basic
    const urlParams = new URLSearchParams(window.location.search);
    const planType = urlParams.get('plan') || 'basic';
    
    const plans = {
      basic: {
        name: 'Basic',
        price: '$9.99',
        priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_BASIC || "price_basic",
        features: [
          'Up to 100 pages per month',
          'Basic extraction templates',
          'Email support',
          'Standard processing speed'
        ]
      },
      professional: {
        name: 'Professional',
        price: '$49.99',
        priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PROFESSIONAL || "price_professional",
        features: [
          'Up to 1,000 pages per month',
          'Advanced custom templates',
          'Priority support',
          'Fast processing speed',
          'API access',
          'Bulk processing'
        ]
      }
    };

    const selectedPlan = plans[planType as keyof typeof plans] || plans.basic;
    console.log('Selected plan:', selectedPlan);
    console.log('Environment variables:', {
      basic: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_BASIC || "price_basic",
      professional: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PROFESSIONAL || "price_professional"
    });
    
    setPlan(selectedPlan);

    // Create subscription
    createSubscription(selectedPlan.priceId);
  }, []);

  const createSubscription = async (priceId: string) => {
    try {
      console.log('Creating subscription with priceId:', priceId);
      
      if (!priceId) {
        throw new Error("Price ID is not configured");
      }
      
      // Create checkout session
      const response = await apiRequest("POST", "/api/create-subscription", {
        priceId
      });
      
      const data = await response.json();
      
      if (data.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.checkoutUrl;
        return;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast({
        title: "Subscription Error",
        description: error.message || "Failed to initialize subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Setting up your subscription...</p>
        </div>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Unable to load payment form. Please try again.</p>
          <Button onClick={() => window.history.back()} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Subscription</h1>
          <p className="text-gray-600 mt-2">You're one step away from unlocking powerful PDF extraction</p>
        </div>

        <Elements 
          stripe={stripePromise} 
          options={{ 
            clientSecret,
            appearance: {
              theme: 'stripe',
            },
          }}
        >
          <SubscribeForm plan={plan} />
        </Elements>
      </div>
    </div>
  );
}