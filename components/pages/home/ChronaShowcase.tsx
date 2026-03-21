'use client'

import { motion } from "framer-motion";
import { Clock, BarChart3, Search, BookOpen, LayoutDashboard, Target } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const features = [
  { icon: Clock, label: "Structured Timeline", detail: "AI turns screen captures into time-aligned activity cards" },
  { icon: Target, label: "Focus Reviews", detail: "Rate time blocks as focused, neutral, or distracted" },
  { icon: Search, label: "Natural Language Search", detail: "Ask questions about your day with clickable source references" },
  { icon: BookOpen, label: "AI Journal", detail: "Auto-generated daily reflections grounded in your timeline" },
  { icon: LayoutDashboard, label: "Dashboard", detail: "Trends, category breakdowns, and longest focus streaks" },
  { icon: BarChart3, label: "Analytics", detail: "Tracked vs. untracked time across flexible date ranges" },
];

export default function ChronaShowcase() {
  return (
    <section id="chrona-showcase" className="relative py-24 bg-gray-900 text-white overflow-hidden">
      {/* Radial glow accents */}
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-amber-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-500/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <motion.div
          className="text-center mb-12"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.span
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-300 bg-amber-900/40 border border-amber-700/30 px-3 py-1 rounded-full mb-4"
            variants={staggerChild}
          >
            <Clock className="w-3.5 h-3.5" />
            Coming Soon
          </motion.span>
          <motion.h2 className="text-4xl md:text-5xl font-bold mb-4" variants={staggerChild}>
            Chrona: Know Where Your{" "}
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
              Time Goes
            </span>
          </motion.h2>
          <motion.p className="text-lg text-gray-400 max-w-2xl mx-auto" variants={staggerChild}>
            Automatic screen-based time tracking with AI-powered timeline generation. Everything stays local until you choose to analyze.
          </motion.p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.label}
                className="bg-white/5 border border-white/10 rounded-xl p-5 backdrop-blur-sm"
                variants={staggerChild}
              >
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4.5 h-4.5 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{f.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{f.detail}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Embedded Vimeo demo */}
        <motion.div
          className="max-w-4xl mx-auto"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-black/30">
            <div className="bg-gray-800 px-4 py-2 border-b border-white/5 flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-400/80 rounded-full" />
              <div className="w-3 h-3 bg-yellow-400/80 rounded-full" />
              <div className="w-3 h-3 bg-green-400/80 rounded-full" />
              <span className="text-xs text-gray-500 ml-2">Chrona Demo</span>
            </div>
            <div className="relative bg-black aspect-video">
              <iframe
                className="absolute inset-0 w-full h-full border-0"
                loading="lazy"
                src="https://player.vimeo.com/video/1163177906?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
                title="Chrona Demo"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </motion.div>

        <motion.p
          className="text-center text-sm text-gray-500 mt-6"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          Desktop app available now. CPAAutomation dashboard integration coming soon.
        </motion.p>
      </div>
    </section>
  );
}
