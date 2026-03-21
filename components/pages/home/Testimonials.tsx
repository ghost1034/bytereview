'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const testimonials = [
  {
    initials: "AM",
    gradientFrom: "from-blue-500",
    gradientTo: "to-blue-600",
    company: "A*** Manufacturing",
    person: "D*** Wilton, Supply Chain Director",
    headline: "Handles complex supplier documents",
    quote: "We process thousands of supplier certifications, quality reports, and invoices monthly. The custom extraction feature lets us automatically categorize materials by grade and extract compliance codes for our procurement system.",
  },
  {
    initials: "SV",
    gradientFrom: "from-green-500",
    gradientTo: "to-green-600",
    company: "S****** Ventures",
    person: "J*** Park, Partner",
    headline: "Essential for due diligence",
    quote: "We evaluate hundreds of companies quarterly. Extracting financial metrics, revenue breakdowns, and key performance indicators from pitch decks and financial statements used to take weeks. Now it's literally done in minutes.",
  },
  {
    initials: "NT",
    gradientFrom: "from-purple-500",
    gradientTo: "to-purple-600",
    company: "N********** Technologies",
    person: "A*** Kumar, CLO",
    headline: "Accelerates contract processing",
    quote: "Our legal team reviews hundreds of vendor agreements monthly. We now extract key terms, pricing structures, and SLA commitments automatically. What used to take 3 hours per contract now takes two minutes.",
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-14"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <span className="inline-block text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-4">
            Testimonials
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">What our customers are saying</h2>
        </motion.div>

        {/* Carousel */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Carousel
            opts={{ align: "start", loop: true }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {testimonials.map((t) => (
                <CarouselItem key={t.initials} className="pl-4 md:basis-1/2 lg:basis-1/3">
                  <Card className="h-full border-gray-200">
                    <CardContent className="p-8 flex flex-col h-full">
                      {/* Stars */}
                      <div className="flex space-x-1 mb-5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>

                      {/* Quote */}
                      <h5 className="font-bold text-lg text-gray-900 mb-3">{t.headline}</h5>
                      <p className="text-gray-600 leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>

                      {/* Author */}
                      <div className="flex items-center space-x-3 mt-6 pt-6 border-t border-gray-100">
                        <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${t.gradientFrom} ${t.gradientTo} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white font-bold text-sm">{t.initials}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{t.company}</p>
                          <p className="text-gray-500 text-xs">{t.person}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="flex justify-center gap-2 mt-6">
              <CarouselPrevious className="static translate-y-0 border-gray-300" />
              <CarouselNext className="static translate-y-0 border-gray-300" />
            </div>
          </Carousel>
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
            <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white h-full border-0 shadow-xl">
              <CardContent className="p-10 flex flex-col justify-center h-full">
                <span className="inline-block text-xs font-medium text-blue-200 bg-white/15 px-2.5 py-1 rounded-full mb-4 w-fit">
                  Case Study
                </span>
                <h3 className="text-2xl font-bold mb-4">
                  A leading family office saves hundreds of hours per year processing investment statements
                </h3>
                <p className="text-lg mb-8 text-blue-100 leading-relaxed">
                  &ldquo;Our team used to spend weeks manually extracting financial data from portfolio reports. Now we process quarterly statements from 100+ companies in just minutes with perfect accuracy.&rdquo;
                </p>
                <Link href="/case-study/LFO">
                  <Button className="bg-white text-blue-600 hover:bg-gray-100 font-semibold">
                    Read the full case study →
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={staggerChild}>
            <div className="h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Watch our pitch</h3>
              <div className="rounded-xl overflow-hidden border border-gray-200 shadow-md flex-1">
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
