'use client'

import { motion } from "framer-motion";
import { Bot, Check } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const capabilities = [
  "Automated bank reconciliations",
  "Contract clause extraction and review",
  "Tax form preparation and validation",
  "Regulatory compliance checks",
];

export default function ClawShowcase() {
  return (
    <section id="claw-showcase" className="py-24 bg-gradient-to-b from-white to-gray-50">
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 bg-green-100 px-3 py-1 rounded-full mb-4"
              variants={staggerChild}
            >
              <Bot className="w-3.5 h-3.5" />
              Coming Soon
            </motion.span>
            <motion.h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4" variants={staggerChild}>
              Claw Series:{" "}
              <span className="bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
                Digital Workers
              </span>{" "}
              for Accounting, Finance & Legal
            </motion.h2>
            <motion.p className="text-lg text-gray-600 mb-8 leading-relaxed" variants={staggerChild}>
              AccountingClaw, FinanceClaw, and LegalClaw are AI agents that work autonomously — not just tools you operate, but digital workers you deploy. Hundreds of pre-built skills with guardrails designed for regulated environments.
            </motion.p>

            <motion.ul className="space-y-3 mb-8" variants={staggerContainer}>
              {capabilities.map((item) => (
                <motion.li key={item} className="flex items-start space-x-3" variants={staggerChild}>
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{item}</span>
                </motion.li>
              ))}
            </motion.ul>

            <motion.p className="text-sm text-gray-500" variants={staggerChild}>
              Powered by OpenClaw, an open-source AI agent framework. One-click setup.
            </motion.p>
          </motion.div>

          {/* Right: videos */}
          <motion.div
            className="space-y-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <motion.div
              className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
              variants={staggerChild}
            >
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <span className="text-sm text-gray-500 ml-2">AccountingClaw Preview</span>
              </div>
              <div className="relative bg-black aspect-video">
                <iframe
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                  src="https://www.youtube-nocookie.com/embed/976yIJsO1cA?si=82I14R9fUPznZX1E"
                  title="AccountingClaw Preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </motion.div>

            <motion.div
              className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
              variants={staggerChild}
            >
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <span className="text-sm text-gray-500 ml-2">Dual Agent Technical Accounting Memo</span>
              </div>
              <div className="relative bg-black aspect-video">
                <iframe
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                  src="https://www.youtube-nocookie.com/embed/hePBTs8MnFQ?si=exJDcDO07KvjXkb4"
                  title="Dual Agent Technical Accounting Memo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </motion.div>

            <motion.div
              className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
              variants={staggerChild}
            >
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <span className="text-sm text-gray-500 ml-2">AI Skill for Browser Automation</span>
              </div>
              <div className="relative bg-black aspect-video">
                <iframe
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                  src="https://www.youtube-nocookie.com/embed/939uCq5jxN0?si=77c9Gr7DVJiHKlnx"
                  title="AI Skill for Browser Automation"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
