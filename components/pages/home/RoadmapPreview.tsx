'use client'

import { motion } from "framer-motion";
import { Bot, BarChart3, FolderKanban } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const milestones = [
  {
    icon: Bot,
    color: "bg-green-100 text-green-600 border-green-200",
    accentLine: "bg-green-500",
    title: "AccountingClaw / FinanceClaw / LegalClaw",
    description: "Hundreds of pre-built AI skills for regulated environments. One-click setup powered by OpenClaw, an open-source AI agent framework.",
  },
  {
    icon: BarChart3,
    color: "bg-red-100 text-red-600 border-red-200",
    accentLine: "bg-red-500",
    title: "AI Analysis Suite",
    description: "Automated reconciliation, flux analysis, amortization schedules, and distribution waterfalls.",
  },
  {
    icon: FolderKanban,
    color: "bg-teal-100 text-teal-600 border-teal-200",
    accentLine: "bg-teal-500",
    title: "AI Productivity Suite",
    description: "AI-powered project management, month-end checklists, slide decks, and expense reimbursement.",
  },
];

export default function RoadmapPreview() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">What&apos;s Coming Next</h2>
          <p className="text-xl text-gray-600">We&apos;re building the tools professional services teams have been waiting for.</p>
        </motion.div>

        <motion.div
          className="relative space-y-8"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {/* Vertical timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200 hidden md:block" />

          {milestones.map((m) => {
            const Icon = m.icon;
            return (
              <motion.div key={m.title} className="flex items-start space-x-6 relative" variants={staggerChild}>
                <div className={`relative z-10 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 border ${m.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="pt-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{m.title}</h3>
                  <p className="text-gray-600">{m.description}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
