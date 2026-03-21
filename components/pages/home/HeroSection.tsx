'use client'

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

interface HeroSectionProps {
  onGetStarted: () => void;
}

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  return (
    <section className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white min-h-[calc(100vh-var(--header-height))] flex items-center py-20 overflow-hidden">
      {/* Subtle animated background grid */}
      <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <motion.div
          className="text-center max-w-4xl mx-auto"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            className="text-5xl md:text-6xl font-bold text-white mb-4"
            variants={fadeInUp}
          >
            The AI Platform for Accounting, Finance & Legal Professionals
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-gray-300 mb-10 max-w-3xl mx-auto"
            variants={fadeInUp}
          >
            From document intelligence to AI writing, time tracking, and autonomous agents — one platform built by CPAs, for professionals.
          </motion.p>

          <motion.div className="mb-12" variants={fadeInUp}>
            <div className="flex items-center justify-center space-x-2 max-w-md mx-auto">
              <Button
                onClick={onGetStarted}
                className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-3 text-base font-semibold w-full"
              >
                Get Started Free →
              </Button>
            </div>
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-400 mt-4">
              <div className="flex items-center space-x-1">
                <Check className="text-green-500 w-4 h-4" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center space-x-1">
                <Check className="text-green-500 w-4 h-4" />
                <span>100 free pages/month</span>
              </div>
            </div>
          </motion.div>

          {/* Trust stats */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-2xl mx-auto"
            variants={staggerContainer}
          >
            {[
              { value: "99.2%", label: "Accuracy Rate" },
              { value: "95%", label: "Time Reduction" },
              { value: "100+", label: "Document Types" },
            ].map((stat) => (
              <motion.div key={stat.label} className="text-center" variants={staggerChild}>
                <div className="text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
