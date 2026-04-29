'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Files, Sparkles, FileText, Database } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const highlights = [
  "Fillable PDF, PDF overlay, and DOCX placeholder strategies",
  "Use extraction results as a structured data source",
  "Save and reuse Form Fill templates",
  "Output as PDF or DOCX",
];

const sourceFields = [
  { label: "Client Name", value: "Acme Holdings, LLC" },
  { label: "Tax ID", value: "47-1923847" },
  { label: "Period End", value: "12/31/2025" },
  { label: "Total Revenue", value: "$4,829,150" },
];

const targetFields = [
  { label: "Entity Name", value: "Acme Holdings, LLC", filled: true },
  { label: "EIN", value: "47-1923847", filled: true },
  { label: "Reporting Period", value: "12/31/2025", filled: true },
  { label: "Gross Receipts", value: "$4,829,150", filled: true },
  { label: "Signature", value: "", filled: false },
];

export default function FormFillShowcase() {
  return (
    <section id="form-fill-showcase" className="py-24 bg-gradient-to-b from-white to-indigo-50/40">
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full mb-4"
              variants={staggerChild}
            >
              <Files className="w-3.5 h-3.5" />
              Available Now
            </motion.span>
            <motion.h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4" variants={staggerChild}>
              Form Fill: Auto-Fill Documents from{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
                Your Data
              </span>
            </motion.h2>
            <motion.p className="text-lg text-gray-600 mb-8 leading-relaxed" variants={staggerChild}>
              Upload supporting information and a PDF or DOCX target, or send one selected extraction result directly into Form Fill.
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
              <Link href="/dashboard/form-fill">
                <Button className="bg-lido-blue hover:bg-lido-blue-dark text-white px-6">
                  Try Form Fill →
                </Button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Right: form fill mockup */}
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
                <span className="text-sm text-gray-500 ml-2">Form Fill</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-400">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs text-indigo-500 font-medium">Filling…</span>
              </div>
            </div>

            {/* Two-column source → target */}
            <div className="grid grid-cols-2 gap-0">
              {/* Source data */}
              <div className="border-r border-gray-100 p-4 bg-gray-50/40">
                <div className="flex items-center gap-1.5 mb-3">
                  <Database className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Source data</span>
                </div>
                <div className="space-y-2.5">
                  {sourceFields.map((f) => (
                    <div key={f.label} className="text-xs">
                      <div className="text-gray-500">{f.label}</div>
                      <div className="text-gray-800 font-medium truncate">{f.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-[11px] text-gray-500 bg-white border border-gray-200 rounded-md px-2 py-1.5 inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Q4 Extraction Result.json
                </div>
              </div>

              {/* Target document */}
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Target form</span>
                </div>
                <div className="space-y-2.5">
                  {targetFields.map((f) => (
                    <div key={f.label} className="text-xs">
                      <div className="text-gray-500 mb-0.5">{f.label}</div>
                      <div
                        className={
                          f.filled
                            ? "rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-indigo-800 font-medium truncate"
                            : "rounded border border-dashed border-gray-300 bg-white px-2 py-1 text-gray-300 italic"
                        }
                      >
                        {f.filled ? f.value : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Strategy / output bar */}
            <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {["Fillable PDF", "PDF Overlay", "DOCX Placeholders"].map((s, i) => (
                  <span
                    key={s}
                    className={
                      i === 0
                        ? "text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md px-2 py-1 font-medium"
                        : "text-xs bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-600"
                    }
                  >
                    {s}
                  </span>
                ))}
              </div>
              <span className="text-xs text-gray-500">Output: <span className="font-medium text-gray-700">PDF</span></span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
