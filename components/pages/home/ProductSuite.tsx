'use client'

import { motion } from "framer-motion";
import { FileText, PenTool, Clock, Bot, BarChart3, FolderKanban } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, hoverLift, viewportOnce } from "@/lib/animations";

const products = [
  {
    name: "Universal Document Analysis",
    description: "Extract, analyze, and automate any document type with AI precision.",
    icon: FileText,
    color: "bg-blue-100 text-blue-600",
    status: "Available" as const,
  },
  {
    name: "Inkwise",
    description: "AI-powered writing with citation-grounded references from your own documents.",
    icon: PenTool,
    color: "bg-purple-100 text-purple-600",
    status: "Available" as const,
  },
  {
    name: "Chrona",
    description: "Automatic time tracking that turns your screen into a structured daily timeline.",
    icon: Clock,
    color: "bg-amber-100 text-amber-600",
    status: "Coming Soon" as const,
  },
  {
    name: "AccountingClaw / FinanceClaw / LegalClaw",
    description: "One-click AI agents with hundreds of pre-built skills for regulated industries.",
    icon: Bot,
    color: "bg-green-100 text-green-600",
    status: "Coming Soon" as const,
  },
  {
    name: "AI Analysis Suite",
    description: "Reconciliation, flux analysis, amortization, and distribution waterfalls.",
    icon: BarChart3,
    color: "bg-red-100 text-red-600",
    status: "Coming Soon" as const,
  },
  {
    name: "AI Productivity Suite",
    description: "Project management, month-end checklists, presentations, and expense reimbursement.",
    icon: FolderKanban,
    color: "bg-teal-100 text-teal-600",
    status: "Coming Soon" as const,
  },
];

export default function ProductSuite() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">One Platform, Every Tool You Need</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Purpose-built for accounting, finance, and legal teams — from document processing to autonomous AI agents.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <motion.div
                key={product.name}
                className="relative rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg"
                variants={staggerChild}
                {...hoverLift}
              >
                {product.status === "Coming Soon" && (
                  <span className="absolute top-4 right-4 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                    Coming Soon
                  </span>
                )}
                {product.status === "Available" && (
                  <span className="absolute top-4 right-4 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                    Available
                  </span>
                )}
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${product.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{product.name}</h3>
                <p className="text-gray-600 text-sm">{product.description}</p>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.p
          className="text-center text-sm text-gray-500 mt-8"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          AI agent products powered by OpenClaw, an open-source AI agent framework.
        </motion.p>
      </div>
    </section>
  );
}
