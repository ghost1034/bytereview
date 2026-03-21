'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { fadeInUp, viewportOnce } from "@/lib/animations";

interface FAQSectionProps {
  onGetStarted: () => void;
}

const faqs = [
  {
    question: "How accurate is the AI extraction?",
    answer: "Our AI achieves 99%+ accuracy on structured documents like invoices and financial statements. For complex documents, accuracy typically ranges from 95-99%. You can always review and edit results before export.",
  },
  {
    question: "What file types are supported?",
    answer: "We support PDF, DOCX, XLSX, PPTX, TXT, CSV, and most image formats (PNG, JPG, TIFF). We can also process scanned documents and handle multi-page files with complex layouts.",
  },
  {
    question: "How does email automation work?",
    answer: "Simply forward emails with PDF attachments to document@cpaautomation.ai. Our system matches your sender email to your account, applies your automation filters, and processes documents using your configured templates. Results are automatically exported to your chosen destination.",
  },
  {
    question: "Can I customize the extraction fields?",
    answer: "Absolutely! You can create custom fields with your own prompts, data types, and formatting rules. Add accounting codes, classification rules, or any business-specific logic. Templates can be saved and reused across projects.",
  },
  {
    question: "Is there a learning curve?",
    answer: "CPAAutomation is designed for professionals who don't have time for complex training. Most users are extracting data within 10 minutes of signing up. Our CPA-designed interface follows familiar workflows.",
  },
  {
    question: "What about data security and privacy?",
    answer: "Your data is encrypted in transit and at rest, hosted only in US data centers, and automatically deleted after processing. We never use your documents to train AI models. Our platform meets the security standards required by CPA firms and legal practices.",
  },
  {
    question: "What products are included in CPAAutomation?",
    answer: "CPAAutomation includes Universal Document Analysis (extraction & automations), Inkwise (AI writing with grounded citations), a free CPE Tracker, and upcoming products: Chrona (time tracking), AI agents for accounting/finance/legal (powered by OpenClaw), an AI Analysis Suite, and an AI Productivity Suite.",
  },
];

export default function FAQSection({ onGetStarted }: FAQSectionProps) {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
          <p className="text-xl text-gray-600">Everything you need to know about CPAAutomation</p>
        </motion.div>

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-base font-semibold">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>

        <motion.div
          className="text-center mt-12"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <p className="text-gray-600 mb-6">Still have questions? We&apos;re here to help.</p>
          <div className="flex justify-center space-x-4">
            <Link href="/contact">
              <Button variant="outline">Contact Support</Button>
            </Link>
            <Button onClick={onGetStarted} className="bg-lido-green hover:bg-lido-green-dark text-white">
              Start Free Plan →
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
