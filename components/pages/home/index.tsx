'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/auth/AuthModal";

import HeroSection from "./HeroSection";
import ProductSuite from "./ProductSuite";
import ExtractionFeatures from "./ExtractionFeatures";
import AutomationFlow from "./AutomationFlow";
import InkwiseShowcase from "./InkwiseShowcase";
import ChronaShowcase from "./ChronaShowcase";
import RoadmapPreview from "./RoadmapPreview";
import Testimonials from "./Testimonials";
import SecurityTrust from "./SecurityTrust";
import FAQSection from "./FAQSection";
import CTABanner from "./CTABanner";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleGetStarted = () => {
    if (user) {
      router.push("/dashboard");
    } else {
      setIsAuthModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen">
      <HeroSection onGetStarted={handleGetStarted} />
      <ProductSuite />
      <ExtractionFeatures onGetStarted={handleGetStarted} />
      <AutomationFlow onGetStarted={handleGetStarted} />
      <InkwiseShowcase />
      <ChronaShowcase />
      <RoadmapPreview />
      <Testimonials />
      <SecurityTrust />
      <FAQSection onGetStarted={handleGetStarted} />
      <CTABanner onGetStarted={handleGetStarted} />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultTab="signup"
      />
    </div>
  );
}
