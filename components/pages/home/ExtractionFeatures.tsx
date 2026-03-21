'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Grid3X3, Settings } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

interface ExtractionFeaturesProps {
  onGetStarted: () => void;
}

const features = [
  {
    icon: FileText,
    color: "bg-blue-100 text-blue-600",
    title: "Data Extractor",
    description: "Intelligently extract and structure key information from any document type with precision.",
    bullets: ["Financial statements", "Contract documents", "Medical records", "Legal forms"],
  },
  {
    icon: Grid3X3,
    color: "bg-purple-100 text-purple-600",
    title: "Table Extractor",
    description: "Advanced table recognition that captures complex layouts and preserves data relationships.",
    bullets: ["Multi-page reports", "Complex spreadsheets", "Financial tables", "Data matrices"],
  },
  {
    icon: Settings,
    color: "bg-orange-100 text-orange-600",
    title: "Custom Extraction",
    description: "Create custom columns with self-defined formats and prompts. Classify data and add details like G/L codes.",
    bullets: ["Custom data formats", "Classification rules", "Accounting codes", "Smart categorization"],
  },
];

export default function ExtractionFeatures({ onGetStarted }: ExtractionFeaturesProps) {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Everything you need to extract data from any file</h2>
          <p className="text-xl text-gray-600">No complex training required — just type in plain English.</p>
        </motion.div>

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
              <motion.div key={feature.title} variants={staggerChild}>
                <Link href="/features" className="block h-full">
                  <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col">
                    <CardContent className="p-8 flex-1 flex flex-col">
                      <div className={`w-16 h-16 rounded-lg flex items-center justify-center mb-6 ${feature.color}`}>
                        <Icon className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                      <p className="text-gray-600 mb-4 flex-1">{feature.description}</p>
                      <div className="space-y-2 text-sm text-gray-500 mt-auto">
                        {feature.bullets.map((b) => (
                          <div key={b}>• {b}</div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
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
            <div className="bg-white text-gray-900 border border-gray-200 rounded-lg overflow-hidden shadow-lg">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <span className="text-sm text-gray-600 ml-2">Investment Statement Extract</span>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-6 gap-1 text-xs">
                  {["Portfolio Co.", "Quarter", "Revenue", "EBITDA", "Growth %", "Valuation"].map((h) => (
                    <div key={h} className="bg-blue-100 p-2 rounded text-center font-medium truncate">{h}</div>
                  ))}
                  {["TechFlow Inc", "Q4 2024", "$12.5M", "$3.2M", "23%", "$85M"].map((v) => (
                    <div key={v} className="p-2 text-center truncate">{v}</div>
                  ))}
                  {["DataMind Corp", "Q4 2024", "$8.7M", "$1.9M", "31%", "$62M"].map((v) => (
                    <div key={v} className="p-2 text-center truncate">{v}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Video + CPE bonus */}
        <motion.div
          className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">See how it works</h3>
            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
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
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Free CPE Tracker Included</h3>
            <p className="text-gray-600 mb-4">
              Automatically extract continuing education credits from certificates. Upload your CPE documents and let AI organize your credits by state requirements.
            </p>
            <Button onClick={onGetStarted} className="bg-lido-green hover:bg-lido-green-dark text-white">
              Try It Free →
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
