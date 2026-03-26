'use client'

import { motion } from "framer-motion";
import { BarChart3, FolderKanban } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const milestones = [
  {
    icon: BarChart3,
    iconBg: "bg-gradient-to-br from-red-100 to-red-50",
    iconText: "text-red-600",
    accentBorder: "border-l-red-500",
    title: "AI Analysis Suite",
    description: "Automated reconciliation, flux analysis, amortization schedules, and distribution waterfalls.",
    capabilities: [
      "Multi-period flux analysis with variance explanations",
      "Amortization schedule generation",
      "Distribution waterfall calculations",
      "Automated reconciliation matching",
    ],
  },
  {
    icon: FolderKanban,
    iconBg: "bg-gradient-to-br from-teal-100 to-teal-50",
    iconText: "text-teal-600",
    accentBorder: "border-l-teal-500",
    title: "AI Productivity Suite",
    description: "AI-powered project management, month-end checklists, slide decks, and expense reimbursement.",
    capabilities: [
      "Month-end close checklists with progress tracking",
      "AI-generated slide presentations from data",
      "Expense reimbursement processing",
      "Project timeline and task management",
    ],
  },
];

export default function RoadmapPreview() {
  return (
    <section id="roadmap" className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <span className="inline-block text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full mb-4">
            Roadmap
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">What&apos;s Coming Next</h2>
          <p className="text-xl text-gray-600">
            We&apos;re building the tools professional services teams have been waiting for.
          </p>
        </motion.div>

        <motion.div
          className="relative space-y-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {/* Vertical timeline line */}
          <div className="absolute left-[23px] top-6 bottom-6 w-px bg-gradient-to-b from-red-300 to-teal-300 hidden md:block" />

          {milestones.map((m) => {
            const Icon = m.icon;
            return (
              <motion.div key={m.title} className="flex items-start gap-6 relative" variants={staggerChild}>
                {/* Timeline dot */}
                <div className={`relative z-10 w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${m.iconBg} shadow-sm`}>
                  <Icon className={`w-6 h-6 ${m.iconText}`} />
                </div>

                {/* Content card */}
                <div className={`flex-1 bg-gray-50 rounded-xl border border-gray-200 border-l-4 ${m.accentBorder} p-6`}>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{m.title}</h3>
                  <p className="text-gray-600 mb-4">{m.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {m.capabilities.map((cap) => (
                      <div key={cap} className="flex items-start space-x-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0 mt-1.5" />
                        <span className="text-gray-500">{cap}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
