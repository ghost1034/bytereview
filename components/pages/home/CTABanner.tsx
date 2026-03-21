'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

interface CTABannerProps {
  onGetStarted: () => void;
}

export default function CTABanner({ onGetStarted }: CTABannerProps) {
  return (
    <section className="relative py-24 bg-gradient-to-br from-green-600 via-blue-600 to-blue-700 text-white overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-white/5 rounded-full blur-[80px] pointer-events-none" />

      <motion.div
        className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <motion.h2 className="text-4xl md:text-5xl font-bold mb-4" variants={staggerChild}>
          Ready to transform your workflow?
        </motion.h2>
        <motion.p className="text-xl text-white/85 mb-10 max-w-2xl mx-auto" variants={staggerChild}>
          Join accounting firms, legal teams, and investment funds already saving hundreds of hours with CPAAutomation.
        </motion.p>

        <motion.div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8" variants={staggerChild}>
          <Button
            onClick={onGetStarted}
            className="btn-shimmer bg-white text-green-700 hover:bg-gray-100 px-8 py-3 text-lg font-semibold"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Link href="/demo">
            <Button
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 px-8 py-3 text-lg"
            >
              See a Demo
            </Button>
          </Link>
        </motion.div>

        <motion.div
          className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/75"
          variants={staggerChild}
        >
          <div className="flex items-center space-x-1.5">
            <Check className="w-4 h-4 text-green-300" />
            <span>No credit card required</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Check className="w-4 h-4 text-green-300" />
            <span>100 free pages/month</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Check className="w-4 h-4 text-green-300" />
            <span>Setup in under 10 minutes</span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
