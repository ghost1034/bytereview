'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, PenTool, Bold, Italic, List, AlignLeft, Sparkles } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const highlights = [
  "Citation-backed drafting grounded in your documents",
  "PDF and Word document references",
  "Image, video & audio support coming soon",
  "Accounting, finance & legal templates included",
];

export default function InkwiseShowcase() {
  return (
    <section id="inkwise-showcase" className="py-24 bg-gradient-to-b from-white to-blue-50/40">
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-600 bg-purple-100 px-3 py-1 rounded-full mb-4"
              variants={staggerChild}
            >
              <PenTool className="w-3.5 h-3.5" />
              Available Now
            </motion.span>
            <motion.h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4" variants={staggerChild}>
              Inkwise: AI Writing Grounded in{" "}
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Your Documents
              </span>
            </motion.h2>
            <motion.p className="text-lg text-gray-600 mb-8 leading-relaxed" variants={staggerChild}>
              The first multimodal retrieval-based writing tool in the market. Draft memos, reports, and analyses with AI that cites your own source materials.
            </motion.p>

            <motion.ul className="space-y-3 mb-8" variants={staggerContainer}>
              {highlights.map((item) => (
                <motion.li key={item} className="flex items-start space-x-3" variants={staggerChild}>
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
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
            className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {/* Title bar */}
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <span className="text-sm text-gray-500 ml-2">Inkwise Editor</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-400">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs text-purple-500 font-medium">AI Active</span>
              </div>
            </div>

            {/* Toolbar */}
            <div className="px-4 py-2 border-b border-gray-100 flex items-center space-x-3">
              {[Bold, Italic, List, AlignLeft].map((Icon, i) => (
                <div key={i} className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 text-gray-500">
                  <Icon className="w-4 h-4" />
                </div>
              ))}
              <div className="w-px h-5 bg-gray-200" />
              <div className="flex items-center space-x-1 bg-purple-50 rounded px-2 py-1">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs text-purple-600 font-medium">Write with AI</span>
              </div>
            </div>

            {/* Editor content */}
            <div className="p-6 space-y-4 text-sm text-gray-700 min-h-[280px]">
              <p className="font-semibold text-base text-gray-900">Quarterly Investment Review — Q4 2024</p>
              <p className="leading-relaxed">
                Based on the portfolio statements provided, total AUM increased by 12.3% relative to the prior quarter.
                <span className="inline-flex items-center ml-1 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded font-medium cursor-pointer hover:bg-purple-200 transition-colors">[1]</span>
              </p>
              <p className="leading-relaxed">
                The largest contributor to growth was the technology sector allocation, which returned 18.7% during the period.
                <span className="inline-flex items-center ml-1 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded font-medium cursor-pointer hover:bg-purple-200 transition-colors">[2]</span>
              </p>
              <p className="leading-relaxed">
                Fixed-income allocations underperformed benchmark by 1.2%, driven by rising interest rate expectations.
                <span className="inline-flex items-center ml-1 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded font-medium cursor-pointer hover:bg-purple-200 transition-colors">[3]</span>
              </p>

              {/* AI suggestion */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-800 flex items-start space-x-2">
                <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>AI suggestion:</strong> Consider noting the fixed-income underperformance highlighted in the Morgan Stanley report (Ref 3, p.12) and recommending a portfolio rebalance.
                </div>
              </div>
            </div>

            {/* References bar */}
            <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 mb-2 font-medium">References (3 sources)</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Q4 Portfolio Statement.pdf",
                  "Sector Analysis Report.docx",
                  "Morgan Stanley Review.pdf",
                ].map((ref, i) => (
                  <span
                    key={i}
                    className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-600"
                  >
                    {ref}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
