'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { FileText, PenTool, Clock, Bot, BarChart3, FolderKanban, Files } from "lucide-react";
import { fadeInUp, staggerContainerSlow, staggerChild, hoverLift, viewportOnce } from "@/lib/animations";

const products = [
  {
    name: "Universal Document Analysis",
    description: "Extract, analyze, and automate any document type with AI precision.",
    icon: FileText,
    iconBg: "bg-gradient-to-br from-blue-100 to-blue-50",
    iconText: "text-blue-600",
    status: "Available" as const,
    href: "#extraction-features",
  },
  {
    name: "Form Fill",
    description: "Auto-fill PDFs and Word documents from extraction results, uploaded sources, or saved templates.",
    icon: Files,
    iconBg: "bg-gradient-to-br from-indigo-100 to-indigo-50",
    iconText: "text-indigo-600",
    status: "Available" as const,
    href: "#form-fill-showcase",
  },
  {
    name: "Inkwise",
    description: "AI-powered writing with citation-grounded references from your own documents.",
    icon: PenTool,
    iconBg: "bg-gradient-to-br from-purple-100 to-purple-50",
    iconText: "text-purple-600",
    status: "Available" as const,
    href: "#inkwise-showcase",
  },
  {
    name: "Chrona",
    description: "Automatic time tracking that turns your screen into a structured daily timeline.",
    icon: Clock,
    iconBg: "bg-gradient-to-br from-amber-100 to-amber-50",
    iconText: "text-amber-600",
    status: "Coming Soon" as const,
    href: "#chrona-showcase",
  },
  {
    name: "AccountingClaw / FinanceClaw / LegalClaw",
    description: "Digital workers with hundreds of pre-built skills for regulated industries.",
    icon: Bot,
    iconBg: "bg-gradient-to-br from-green-100 to-green-50",
    iconText: "text-green-600",
    status: "Coming Soon" as const,
    href: "#claw-showcase",
  },
  {
    name: "AI Analysis & Productivity Suites",
    description: "Reconciliation, flux analysis, project management, month-end checklists, and more.",
    icon: BarChart3,
    iconBg: "bg-gradient-to-br from-red-100 to-red-50",
    iconText: "text-red-600",
    secondaryIcon: FolderKanban,
    secondaryIconBg: "bg-gradient-to-br from-teal-100 to-teal-50",
    secondaryIconText: "text-teal-600",
    status: "Coming Soon" as const,
    href: "#roadmap",
  },
];

export default function ProductSuite() {
  return (
    <section id="product-suite" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <span className="inline-block text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-4">
            Full Product Suite
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">One Platform, Every Tool You Need</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Purpose-built for accounting, finance, and legal teams — from document processing to autonomous AI agents.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainerSlow}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {products.map((product) => {
            const Icon = product.icon;
            const SecondaryIcon = "secondaryIcon" in product ? product.secondaryIcon : null;
            const card = (
              <motion.div
                key={product.name}
                className="group relative rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg cursor-pointer"
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
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${product.iconBg}`}>
                    <Icon className={`w-6 h-6 ${product.iconText}`} />
                  </div>
                  {SecondaryIcon && (
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${product.secondaryIconBg}`}>
                      <SecondaryIcon className={`w-6 h-6 ${product.secondaryIconText}`} />
                    </div>
                  )}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {product.name}
                </h3>
                <p className="text-gray-600 text-sm">{product.description}</p>
              </motion.div>
            );

            // Wrap available products in Links, coming-soon in anchor scroll
            if (product.href.startsWith("#")) {
              return (
                <a key={product.name} href={product.href} className="block">
                  {card}
                </a>
              );
            }
            return (
              <Link key={product.name} href={product.href} className="block">
                {card}
              </Link>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
