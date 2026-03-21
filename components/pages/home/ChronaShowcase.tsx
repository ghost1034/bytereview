'use client'

import { motion } from "framer-motion";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const features = [
  "Structured Timeline",
  "Focus Reviews",
  "AI Journal",
  "Natural Language Search",
  "Dashboard Analytics",
];

export default function ChronaShowcase() {
  return (
    <section className="py-20 bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-10"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.span
            className="inline-block text-sm font-medium text-amber-300 bg-amber-900/40 px-3 py-1 rounded-full mb-4"
            variants={staggerChild}
          >
            Coming Soon
          </motion.span>
          <motion.h2 className="text-4xl font-bold mb-4" variants={staggerChild}>
            Chrona: Know Where Your Time Goes
          </motion.h2>
          <motion.p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8" variants={staggerChild}>
            Automatic screen-based time tracking with AI-powered timeline generation, focus reviews, and daily journals.
          </motion.p>

          <motion.div
            className="flex flex-wrap justify-center gap-3 mb-12"
            variants={staggerContainer}
          >
            {features.map((f) => (
              <motion.span
                key={f}
                className="text-sm bg-white/10 border border-white/10 px-4 py-1.5 rounded-full text-gray-300"
                variants={staggerChild}
              >
                {f}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>

        {/* Embedded Vimeo demo */}
        <motion.div
          className="max-w-4xl mx-auto rounded-xl overflow-hidden border border-white/10 shadow-2xl"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
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
        </motion.div>

        <motion.p
          className="text-center text-sm text-gray-500 mt-6"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          Desktop app available now. Dashboard integration coming soon.
        </motion.p>
      </div>
    </section>
  );
}
