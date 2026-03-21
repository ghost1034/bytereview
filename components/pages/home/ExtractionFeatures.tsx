'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Grid3X3, Settings, CloudUpload, Download } from "lucide-react";
import { FaGoogle, FaFileExcel } from "react-icons/fa";
import { fadeInUp, staggerContainer, staggerChild, hoverLift, viewportOnce } from "@/lib/animations";

interface ExtractionFeaturesProps {
  onGetStarted: () => void;
}

const features = [
  {
    icon: FileText,
    iconBg: "bg-gradient-to-br from-blue-100 to-blue-50",
    iconText: "text-blue-600",
    title: "Data Extractor",
    description: "Intelligently extract and structure key information from any document type with precision.",
    bullets: ["Financial statements", "Contract documents", "Medical records", "Legal forms"],
  },
  {
    icon: Grid3X3,
    iconBg: "bg-gradient-to-br from-purple-100 to-purple-50",
    iconText: "text-purple-600",
    title: "Table Extractor",
    description: "Advanced table recognition that captures complex layouts and preserves data relationships.",
    bullets: ["Multi-page reports", "Complex spreadsheets", "Financial tables", "Data matrices"],
  },
  {
    icon: Settings,
    iconBg: "bg-gradient-to-br from-orange-100 to-orange-50",
    iconText: "text-orange-600",
    title: "Custom Extraction",
    description: "Create custom columns with self-defined formats and prompts. Classify data and add details like G/L codes.",
    bullets: ["Custom data formats", "Classification rules", "Accounting codes", "Smart categorization"],
  },
];

const fileTypes = [
  { label: "PDF", color: "bg-red-100 text-red-700" },
  { label: "DOCX", color: "bg-blue-100 text-blue-700" },
  { label: "XLSX", color: "bg-green-100 text-green-700" },
  { label: "PPTX", color: "bg-orange-100 text-orange-700" },
  { label: "TXT", color: "bg-purple-100 text-purple-700" },
  { label: "CSV", color: "bg-pink-100 text-pink-700" },
  { label: "Images", color: "bg-indigo-100 text-indigo-700" },
  { label: "Scanned Docs", color: "bg-gray-100 text-gray-700" },
];

export default function ExtractionFeatures({ onGetStarted }: ExtractionFeaturesProps) {
  return (
    <section id="extraction-features" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <span className="inline-block text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-4">
            Document Analysis
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Everything you need to extract data from any file
          </h2>
          <p className="text-xl text-gray-600">No complex training required — just type in plain English.</p>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div key={feature.title} variants={staggerChild} {...hoverLift}>
                <Link href="/features" className="block h-full">
                  <Card className="group hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col border-gray-200">
                    <CardContent className="p-8 flex-1 flex flex-col">
                      <div className={`w-16 h-16 rounded-lg flex items-center justify-center mb-6 ${feature.iconBg} transition-transform group-hover:scale-110`}>
                        <Icon className={`w-8 h-8 ${feature.iconText}`} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600 mb-4 flex-1">{feature.description}</p>
                      <div className="space-y-2 text-sm text-gray-500 mt-auto">
                        {feature.bullets.map((b) => (
                          <div key={b} className="flex items-center space-x-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Supported file types */}
        <motion.div
          className="mt-16 text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-5">Supports All Document Types</h3>
          <motion.div
            className="flex flex-wrap justify-center gap-3 mb-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {fileTypes.map((ft) => (
              <motion.span
                key={ft.label}
                className={`${ft.color} px-4 py-1.5 rounded-full text-sm font-medium`}
                variants={staggerChild}
              >
                {ft.label}
              </motion.span>
            ))}
          </motion.div>
          <p className="text-sm text-gray-500">Even handles complex multi-page reports, scanned documents, and mixed layouts</p>
        </motion.div>

        {/* Import / Export strip */}
        <motion.div
          className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div
            className="bg-white rounded-xl border border-gray-200 p-6 flex items-start space-x-4"
            variants={staggerChild}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center flex-shrink-0">
              <CloudUpload className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Import From Anywhere</h4>
              <p className="text-sm text-gray-600">
                <FaGoogle className="inline w-3.5 h-3.5 text-blue-500 mr-1" />Google Drive, local upload, ZIP archives, or automated email attachments.
              </p>
            </div>
          </motion.div>
          <motion.div
            className="bg-white rounded-xl border border-gray-200 p-6 flex items-start space-x-4"
            variants={staggerChild}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Export Everywhere</h4>
              <p className="text-sm text-gray-600">
                <FaFileExcel className="inline w-3.5 h-3.5 text-green-500 mr-1" />Excel, CSV, Google Drive auto-delivery, or direct download.
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Investment statement visual */}
        <motion.div
          className="mt-16 flex justify-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="max-w-2xl w-full">
            <div className="bg-white text-gray-900 border border-gray-200 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <span className="text-sm text-gray-500 ml-2">Investment Statement Extract</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <div className="grid grid-cols-6 gap-1.5 text-xs min-w-[480px]">
                  {["Portfolio Co.", "Quarter", "Revenue", "EBITDA", "Growth %", "Valuation"].map((h) => (
                    <div key={h} className="bg-blue-50 p-2 rounded text-center font-semibold text-blue-800 truncate">{h}</div>
                  ))}
                  {["TechFlow Inc", "Q4 2024", "$12.5M", "$3.2M", "23%", "$85M"].map((v, i) => (
                    <div key={`r1-${i}`} className="p-2 text-center text-gray-700 truncate">{v}</div>
                  ))}
                  {["DataMind Corp", "Q4 2024", "$8.7M", "$1.9M", "31%", "$62M"].map((v, i) => (
                    <div key={`r2-${i}`} className="p-2 text-center text-gray-700 truncate bg-gray-50/50">{v}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Video + CPE bonus */}
        <motion.div
          className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">See how it works</h3>
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-md">
              <div className="relative bg-black aspect-video">
                <iframe
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                  src="https://www.youtube-nocookie.com/embed/mxDEliIRWtc?si=brPvZMmN0F5Tbeeh"
                  title="See how it works: Bank Statement Analysis"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </motion.div>
          <motion.div variants={staggerChild}>
            <span className="inline-block text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full mb-3">
              Free Bonus
            </span>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">CPE Tracker Included</h3>
            <p className="text-gray-600 mb-6">
              Automatically extract continuing education credits from certificates. Upload your CPE documents and let AI organize your credits by state requirements.
            </p>
            <Button onClick={onGetStarted} className="bg-lido-green hover:bg-lido-green-dark text-white">
              Try It Free →
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
