'use client'

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight } from "lucide-react";
import AuthModal from "@/components/auth/AuthModal";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

// ── Video card ──────────────────────────────────────────────────────
interface VideoCardProps {
  title: string;
  src: string;
  badge?: string;
  description?: string;
  allow?: string;
}

function VideoCard({ title, src, badge, description, allow }: VideoCardProps) {
  return (
    <div className="flex flex-col">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-400 rounded-full" />
          <div className="w-3 h-3 bg-yellow-400 rounded-full" />
          <div className="w-3 h-3 bg-green-400 rounded-full" />
          <span className="text-sm text-gray-500 ml-2 truncate">{title}</span>
          {badge && (
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">{badge}</Badge>
          )}
        </div>
        <div className="relative bg-black aspect-video">
          <iframe
            className="absolute inset-0 w-full h-full border-0"
            loading="lazy"
            src={src}
            title={title}
            allow={allow ?? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"}
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
      <h3 className="text-base font-semibold text-gray-900 mt-3 text-center">
        {title}
        {badge && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 align-middle">{badge}</Badge>}
      </h3>
      {description && <p className="text-sm text-gray-500 mt-1 text-center">{description}</p>}
    </div>
  );
}

// ── Demo videos data ────────────────────────────────────────────────
const analysisVideos = [
  {
    title: "Build P&L in 2 Minutes",
    src: "https://www.youtube-nocookie.com/embed/tNwpajJZ8zA?si=y6cb2ZD7I42YRXND",
  },
  {
    title: "Free CPE Tracker",
    src: "https://www.youtube-nocookie.com/embed/gchB4SbxsJM?si=KlJMFOjH0nKP08yX",
  },
  {
    title: "Bank Statement Analysis",
    src: "https://www.youtube-nocookie.com/embed/mxDEliIRWtc?si=brPvZMmN0F5Tbeeh",
  },
  {
    title: "Invoice Extraction and Contract Review",
    src: "https://www.youtube-nocookie.com/embed/uWA5ds9VuPM?si=DxjCBqrxZ997eF5A",
  },
  {
    title: "Email and Google Drive Automations",
    src: "https://www.youtube-nocookie.com/embed/R0ubnn4ggGA?si=XZ6cP69kg5JqebIT",
  },
];

const upcomingVideos = [
  {
    title: "AccountingClaw Preview",
    src: "https://www.youtube-nocookie.com/embed/976yIJsO1cA?si=82I14R9fUPznZX1E",
    description: "AI digital workers that perform accounting tasks autonomously.",
  },
  {
    title: "Dual Agent Technical Accounting Memo",
    src: "https://www.youtube-nocookie.com/embed/hePBTs8MnFQ?si=exJDcDO07KvjXkb4",
    description: "Two AI agents collaborate to solve a technical accounting problem through structured reasoning.",
  },
  {
    title: "AI Skill for Browser Automation",
    src: "https://www.youtube-nocookie.com/embed/939uCq5jxN0?si=77c9Gr7DVJiHKlnx",
    description: "Automatically download a NetSuite report with SOX- and audit-compliant screenshots.",
  },
];

// ── Page ─────────────────────────────────────────────────────────────
export default function Demo() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pt-20 pb-12 bg-white">
        <motion.div
          className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.span
            className="inline-block text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-4"
            variants={fadeInUp}
          >
            Demo
          </motion.span>
          <motion.h1
            className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
            variants={fadeInUp}
          >
            See CPAAutomation in Action
          </motion.h1>
          <motion.p
            className="text-xl text-gray-600 max-w-2xl mx-auto"
            variants={fadeInUp}
          >
            Watch how our products work in real-world accounting, finance, and legal workflows.
          </motion.p>
        </motion.div>
      </section>

      {/* Document Analysis Demos */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-10 text-center"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <span className="inline-block text-sm font-medium text-blue-600 bg-blue-100 px-3 py-1 rounded-full mb-3">
              Document Analysis
            </span>
            <h2 className="text-3xl font-bold text-gray-900">AI Extraction, Analysis, and Automations</h2>
          </motion.div>

          <motion.div
            className="flex flex-wrap justify-center gap-8"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {analysisVideos.map((v) => (
              <motion.div key={v.title} className="w-full md:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.34rem)]" variants={staggerChild}>
                <VideoCard {...v} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Products to Come */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-10 text-center"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <span className="inline-block text-sm font-medium text-green-600 bg-green-100 px-3 py-1 rounded-full mb-3">
              Products to Come
            </span>
            <h2 className="text-3xl font-bold text-gray-900">What We&apos;re Building Next</h2>
            <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
              Preview the next generation of tools coming to the CPAAutomation platform.
            </p>
          </motion.div>

          <motion.div
            className="flex flex-wrap justify-center gap-8"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {upcomingVideos.map((v) => (
              <motion.div key={v.title} className="w-full md:w-[calc(50%-1rem)]" variants={staggerChild}>
                <VideoCard {...v} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-green-600 via-blue-600 to-blue-700 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-white/5 rounded-full blur-[80px] pointer-events-none" />

        <motion.div
          className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.h2 className="text-3xl md:text-4xl font-bold mb-4" variants={staggerChild}>
            Try CPAAutomation Yourself
          </motion.h2>
          <motion.p className="text-lg text-white/85 mb-8 max-w-2xl mx-auto" variants={staggerChild}>
            Create a free account to upload documents, connect Gmail or Google Drive, run automations, and see results in your dashboard.
          </motion.p>
          <motion.div variants={staggerChild}>
            <Button
              onClick={() => setIsAuthModalOpen(true)}
              className="btn-shimmer bg-white text-green-700 hover:bg-gray-100 px-8 py-3 text-lg font-semibold"
            >
              Sign Up for Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
          <motion.div
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/75 mt-5"
            variants={staggerChild}
          >
            <div className="flex items-center space-x-1.5">
              <Check className="w-4 h-4 text-green-300" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Check className="w-4 h-4 text-green-300" />
              <span>100 free pages/month</span>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultTab="signup"
      />
    </div>
  );
}
