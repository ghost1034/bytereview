'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const testimonials = [
  {
    initials: "AM",
    color: "bg-blue-100 text-blue-600",
    company: "A*** Manufacturing",
    person: "D*** Wilton, Supply Chain Director",
    headline: "Handles complex supplier documents",
    quote: "We process thousands of supplier certifications, quality reports, and invoices monthly. The custom extraction feature lets us automatically categorize materials by grade and extract compliance codes for our procurement system.",
  },
  {
    initials: "SV",
    color: "bg-green-100 text-green-600",
    company: "S****** Ventures",
    person: "J*** Park, Partner",
    headline: "Essential for due diligence",
    quote: "We evaluate hundreds of companies quarterly. Extracting financial metrics, revenue breakdowns, and key performance indicators from pitch decks and financial statements used to take weeks. Now it's literally done in minutes.",
  },
  {
    initials: "NT",
    color: "bg-purple-100 text-purple-600",
    company: "N********** Technologies",
    person: "A*** Kumar, CLO",
    headline: "Accelerates contract processing",
    quote: 'Our legal team reviews hundreds of vendor agreements monthly. We now extract key terms, pricing structures, and SLA commitments automatically. What used to take 3 hours per contract now takes two minutes.',
  },
];

export default function Testimonials() {
  return (
    <section className="py-20 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">What our customers are saying</h2>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {testimonials.map((t) => (
            <motion.div key={t.initials} variants={staggerChild}>
              <Card className="h-full">
                <CardContent className="p-8">
                  <div className={`w-16 h-16 rounded-full mb-4 flex items-center justify-center ${t.color}`}>
                    <span className="font-bold text-lg">{t.initials}</span>
                  </div>
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900">{t.company}</h4>
                    <p className="text-gray-600 text-sm">{t.person}</p>
                  </div>
                  <h5 className="font-bold text-lg mb-2">{t.headline}</h5>
                  <p className="text-gray-600">&ldquo;{t.quote}&rdquo;</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Case study + pitch video */}
        <motion.div
          className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={staggerChild}>
            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white h-full">
              <CardContent className="p-10 flex flex-col justify-center h-full">
                <h3 className="text-2xl font-bold mb-4">A leading family office saves hundreds of hours per year processing investment statements</h3>
                <p className="text-lg mb-6 text-blue-100">&ldquo;Our team used to spend weeks manually extracting financial data from portfolio reports. Now we process quarterly statements from 100+ companies in just minutes with perfect accuracy.&rdquo;</p>
                <Link href="/case-study/LFO">
                  <Button className="bg-white text-blue-600 hover:bg-gray-100">
                    Read the full case study →
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={staggerChild}>
            <div className="h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Watch our pitch</h3>
              <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-1">
                <div className="relative bg-black aspect-video">
                  <iframe
                    className="absolute inset-0 w-full h-full border-0"
                    loading="lazy"
                    src="https://www.youtube-nocookie.com/embed/vhFcyZh07b8?si=miMLgbIVkr9Q6Pdo"
                    title="Watch our pitch"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
