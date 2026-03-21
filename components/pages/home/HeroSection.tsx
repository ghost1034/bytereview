'use client'

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Play } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

// ── Count-up component ──────────────────────────────────────────────
function CountUp({ target, suffix = "", decimals = 0 }: { target: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [value, setValue] = useState(0);

  const animate = useCallback(() => {
    const duration = 2000;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [target]);

  useEffect(() => {
    if (inView) animate();
  }, [inView, animate]);

  return (
    <span ref={ref}>
      {decimals > 0 ? value.toFixed(decimals) : Math.round(value)}
      {suffix}
    </span>
  );
}

// ── Hero section ────────────────────────────────────────────────────
interface HeroSectionProps {
  onGetStarted: () => void;
}

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  const scrollToDemo = () => {
    const el = document.getElementById("extraction-features");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white min-h-[calc(100vh-var(--header-height))] flex items-center py-20 overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial glow accents */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <motion.div
          className="text-center max-w-4xl mx-auto"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* Badge */}
          <motion.div className="mb-6" variants={fadeInUp}>
            <span className="inline-block text-sm font-medium text-blue-300 bg-blue-500/15 border border-blue-400/20 px-4 py-1.5 rounded-full">
              Built by CPAs, for professionals
            </span>
          </motion.div>

          <motion.h1
            className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight"
            variants={fadeInUp}
          >
            The AI Platform for{" "}
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Accounting, Finance & Legal
            </span>{" "}
            Professionals
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed"
            variants={fadeInUp}
          >
            From document intelligence to AI writing, time tracking, and autonomous agents — one platform that handles your most time-consuming work.
          </motion.p>

          {/* CTAs */}
          <motion.div className="mb-14" variants={fadeInUp}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-lg mx-auto">
              <Button
                onClick={onGetStarted}
                className="btn-shimmer bg-white text-gray-900 hover:bg-gray-100 px-8 py-3 text-base font-semibold w-full sm:w-auto"
              >
                Get Started Free →
              </Button>
              <Button
                variant="outline"
                onClick={scrollToDemo}
                className="border-white/20 text-white hover:bg-white/10 px-8 py-3 text-base w-full sm:w-auto"
              >
                <Play className="w-4 h-4 mr-2" />
                Watch Demo
              </Button>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-gray-400 mt-5">
              <div className="flex items-center space-x-1.5">
                <Check className="text-green-500 w-4 h-4" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Check className="text-green-500 w-4 h-4" />
                <span>100 free pages/month</span>
              </div>
            </div>
          </motion.div>

          {/* Animated trust stats */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-2xl mx-auto"
            variants={staggerContainer}
          >
            <motion.div className="text-center" variants={staggerChild}>
              <div className="text-4xl font-bold text-white">
                <CountUp target={99.2} suffix="%" decimals={1} />
              </div>
              <div className="text-sm text-gray-400 mt-1">Accuracy Rate</div>
            </motion.div>
            <motion.div className="text-center" variants={staggerChild}>
              <div className="text-4xl font-bold text-white">
                <CountUp target={95} suffix="%" />
              </div>
              <div className="text-sm text-gray-400 mt-1">Time Reduction</div>
            </motion.div>
            <motion.div className="text-center" variants={staggerChild}>
              <div className="text-4xl font-bold text-white">
                <CountUp target={100} suffix="+" />
              </div>
              <div className="text-sm text-gray-400 mt-1">Document Types</div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
