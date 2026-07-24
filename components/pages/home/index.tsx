'use client'

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/auth/AuthModal";
import { ConsultingBanner } from "@/components/marketing/consulting-banner";
import { HomeBackground } from "./shared/HomeBackground";

// Above the fold — load immediately
import HeroSection from "./HeroSection";
import ProductSuite from "./ProductSuite";

// Below the fold — lazy load
const ExtractionFeatures = dynamic(() => import("./ExtractionFeatures"));
const AutomationFlow = dynamic(() => import("./AutomationFlow"));
const FormFillShowcase = dynamic(() => import("./FormFillShowcase"));
const InkwiseShowcase = dynamic(() => import("./InkwiseShowcase"));
const EsignShowcase = dynamic(() => import("./EsignShowcase"));
const ChronaShowcase = dynamic(() => import("./ChronaShowcase"));
const AnalyticsShowcase = dynamic(() => import("./AnalyticsShowcase"));
const ClawShowcase = dynamic(() => import("./ClawShowcase"));
const RoadmapPreview = dynamic(() => import("./RoadmapPreview"));
const Testimonials = dynamic(() => import("./Testimonials"));
const SecurityTrust = dynamic(() => import("./SecurityTrust"));
const FAQSection = dynamic(() => import("./FAQSection"));
const CTABanner = dynamic(() => import("./CTABanner"));

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
    // `dark marketing-dark` scopes the immersive navy theme to the homepage only.
    // Nothing else in the app applies `.dark`, so the dashboard/app stay light.
    <div className="dark marketing-dark relative min-h-screen bg-background text-foreground">
      <HomeBackground />
      <ConsultingBanner />

      <HeroSection onGetStarted={handleGetStarted} />
      <ProductSuite />
      <ExtractionFeatures onGetStarted={handleGetStarted} />
      <AutomationFlow onGetStarted={handleGetStarted} />
      <FormFillShowcase />
      <InkwiseShowcase />
      <EsignShowcase />
      <ChronaShowcase />
      <ClawShowcase />
      <AnalyticsShowcase />
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
