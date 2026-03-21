'use client'

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { fadeInUp, viewportOnce } from "@/lib/animations";

interface CTABannerProps {
  onGetStarted: () => void;
}

export default function CTABanner({ onGetStarted }: CTABannerProps) {
  return (
    <section className="py-20 bg-gradient-to-r from-green-600 to-blue-600 text-white">
      <motion.div
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <h2 className="text-4xl font-bold mb-4">Ready to transform your workflow?</h2>
        <p className="text-xl opacity-90 mb-8">Start free — no credit card required. 100 free pages/month.</p>
        <Button
          onClick={onGetStarted}
          className="bg-white text-green-600 hover:bg-gray-100 px-8 py-3 text-lg font-semibold"
        >
          Get Started Free →
        </Button>
      </motion.div>
    </section>
  );
}
