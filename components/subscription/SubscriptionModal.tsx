import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const { user } = useAuth();

  const plans = [
    {
      name: "Basic",
      price: "$9.99",
      period: "per month",
      features: [
        "Up to 100 pages per month",
        "Basic extraction templates",
        "Email support",
        "Standard processing speed"
      ]
    },
    {
      name: "Professional",
      price: "$49.99",
      period: "per month",
      features: [
        "Unlimited pages per month",
        "Advanced custom templates",
        "Priority support",
        "Fast processing speed",
        "API access",
        "Bulk processing"
      ]
    }
  ];

  const handleSelectPlan = (planName: string) => {
    if (!user) {
      onClose();
      return;
    }
    window.location.href = `/subscribe?plan=${planName.toLowerCase()}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            Choose Your Plan
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6 py-4">
          {plans.map((plan, index) => (
            <div 
              key={plan.name}
              className={`border rounded-lg p-6 ${
                index === 1 ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
              }`}
            >
              {index === 1 && (
                <div className="bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full text-center mb-4">
                  MOST POPULAR
                </div>
              )}
              
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{plan.name}</h3>
                <div className="text-3xl font-bold text-gray-900">{plan.price}</div>
                <div className="text-gray-600 text-sm">{plan.period}</div>
              </div>

              <div className="space-y-3 mb-6">
                {plan.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-center text-sm">
                    <Check className="w-4 h-4 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>

              <Button 
                onClick={() => handleSelectPlan(plan.name)}
                className={`w-full ${
                  index === 1 
                    ? 'lido-green hover:lido-green-dark text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Get Started
              </Button>
            </div>
          ))}
        </div>

        <div className="text-center pt-4 border-t">
          <p className="text-sm text-gray-600">
            All plans include 14-day free trial • Cancel anytime
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}