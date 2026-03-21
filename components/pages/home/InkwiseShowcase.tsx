'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const highlights = [
  "Citation-backed drafting grounded in your documents",
  "PDF and Word document references",
  "Image, video & audio support coming soon",
  "Accounting, finance & legal templates included",
];

export default function InkwiseShowcase() {
  return (
    <section id="inkwise-showcase" className="py-20 bg-gradient-to-b from-white to-blue-50/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: description */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <motion.span
              className="inline-block text-sm font-medium text-purple-600 bg-purple-100 px-3 py-1 rounded-full mb-4"
              variants={staggerChild}
            >
              Available Now
            </motion.span>
            <motion.h2 className="text-4xl font-bold text-gray-900 mb-4" variants={staggerChild}>
              Inkwise: AI Writing Grounded in Your Documents
            </motion.h2>
            <motion.p className="text-lg text-gray-600 mb-6" variants={staggerChild}>
              The first multimodal retrieval-based writing tool in the market. Draft memos, reports, and analyses with AI that cites your own source materials.
            </motion.p>

            <motion.ul className="space-y-3 mb-8" variants={staggerContainer}>
              {highlights.map((item) => (
                <motion.li key={item} className="flex items-center space-x-3" variants={staggerChild}>
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">{item}</span>
                </motion.li>
              ))}
            </motion.ul>

            <motion.div variants={staggerChild}>
              <Link href="/dashboard/inkwise">
                <Button className="bg-lido-blue hover:bg-lido-blue-dark text-white px-6">
                  Try Inkwise →
                </Button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Right: editor mockup */}
          <motion.div
            className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-400 rounded-full" />
              <div className="w-3 h-3 bg-yellow-400 rounded-full" />
              <div className="w-3 h-3 bg-green-400 rounded-full" />
              <span className="text-sm text-gray-500 ml-2">Inkwise Editor</span>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-700">
              <p className="font-semibold text-base text-gray-900">Quarterly Investment Review — Q4 2024</p>
              <p>
                Based on the portfolio statements provided, total AUM increased by 12.3% relative to the prior quarter.
                <span className="inline-flex items-center ml-1 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded font-medium">[1]</span>
              </p>
              <p>
                The largest contributor to growth was the technology sector allocation, which returned 18.7% during the period.
                <span className="inline-flex items-center ml-1 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded font-medium">[2]</span>
              </p>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-800">
                <strong>AI suggestion:</strong> Consider noting the fixed-income underperformance highlighted in the Morgan Stanley report (Ref 3, p.12).
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
