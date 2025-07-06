import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/AuthModal";
// import SubscriptionModal from "@/components/SubscriptionModal";

export default function Pricing() {
  const [email, setEmail] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string>("");
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const plans = {
    basic: {
      name: "Basic",
      price: "$9.99",
      priceId: import.meta.env.VITE_STRIPE_PRICE_ID_BASIC,
      features: [
        "Up to 100 pages per month",
        "Basic extraction templates",
        "Email support",
        "Standard processing speed"
      ]
    },
    professional: {
      name: "Professional", 
      price: "$49.99",
      priceId: import.meta.env.VITE_STRIPE_PRICE_ID_PROFESSIONAL,
      features: [
        "Up to 1,000 pages per month",
        "Advanced custom templates",
        "Priority support",
        "Fast processing speed",
        "API access",
        "Bulk processing"
      ]
    }
  };

  const handleGetStarted = (plan: any) => {
    if (!user) {
      setPendingRedirect(`/subscribe?plan=${plan.name.toLowerCase()}`);
      setIsAuthModalOpen(true);
    } else {
      // Use client-side navigation instead of window.location.href
      setLocation(`/subscribe?plan=${plan.name.toLowerCase()}`);
    }
  };

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Pricing for teams of every size</h1>
          <p className="text-xl text-gray-600">All plans are available month-to-month and you can cancel at any time.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Basic Plan */}
          <Card className="border border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Basic</h3>
              <p className="text-gray-600 mb-6">For individuals and small teams</p>
              
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">$9.99</span>
                <span className="text-gray-600">/ month</span>
              </div>
              
              <ul className="space-y-3 mb-8">
                {plans.basic.features.map((feature, index) => (
                  <li key={index} className="flex items-center space-x-2">
                    <Check className="text-green-500 w-4 h-4" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button 
                className="w-full lido-green hover:lido-green-dark text-white"
                onClick={() => handleGetStarted(plans.basic)}
              >
                Get Started
              </Button>
            </CardContent>
          </Card>

          {/* Professional Plan */}
          <Card className="border-2 border-green-500 relative transform scale-105 shadow-lg">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span className="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold">Most Popular</span>
            </div>
            <CardContent className="p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Professional</h3>
              <p className="text-gray-600 mb-6">For growing finance teams</p>
              
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">$49.99</span>
                <span className="text-gray-600">/ month</span>
              </div>
              
              <ul className="space-y-3 mb-8">
                {plans.professional.features.map((feature, index) => (
                  <li key={index} className="flex items-center space-x-2">
                    <Check className="text-green-500 w-4 h-4" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button 
                className="w-full lido-green hover:lido-green-dark text-white"
                onClick={() => handleGetStarted(plans.professional)}
              >
                Get Started
              </Button>
            </CardContent>
          </Card>

          {/* Enterprise Plan */}
          <Card className="border border-gray-200 hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Enterprise</h3>
              <p className="text-gray-600 mb-6">For large organizations requiring unlimited processing</p>
              
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">Talk to Sales</span>
              </div>
              
              <ul className="space-y-3 mb-8">
                <li className="flex items-center space-x-2">
                  <Check className="text-green-500 w-4 h-4" />
                  <span>Unlimited pages</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="text-green-500 w-4 h-4" />
                  <span>Unlimited users</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="text-green-500 w-4 h-4" />
                  <span>Dedicated US-based support</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="text-green-500 w-4 h-4" />
                  <span>Custom data integrations</span>
                </li>
              </ul>
              
              <Link href="/contact">
                <Button className="w-full lido-green hover:lido-green-dark text-white">
                  Talk to Sales
                </Button>
              </Link>
            </CardContent>
          </Card>
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
                <h3 className="font-semibold text-lg text-gray-900 mb-2">What types of files does Financial Extract support?</h3>
                <p className="text-gray-600">Financial Extract works with PDFs (both scanned and searchable), images (JPEG, PNG), and email attachments. Our AI is specifically trained on financial and legal documents.</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Is my data secure?</h3>
                <p className="text-gray-600">Yes, we use enterprise-grade security with AES-256 encryption. All files are immediately deleted post-processing and our servers are hosted exclusively in the U.S.A.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Who created the extraction rules?</h3>
                <p className="text-gray-600">Our extraction algorithms were developed by real CPAs and lawyers with deep expertise in financial compliance and legal document processing requirements. Additionally, users can create custom rules by entering their own prompts for each column, allowing maximum flexibility for specific business needs.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">What export formats are available?</h3>
                <p className="text-gray-600">All plans include export to Excel, Google Sheets, and CSV formats. Enterprise plans also include custom data integrations with your existing systems.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        redirectTo={pendingRedirect}
      />
      

    </div>
  );
}
