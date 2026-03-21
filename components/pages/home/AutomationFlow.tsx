'use client'

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

interface AutomationFlowProps {
  onGetStarted: () => void;
}

const steps = [
  {
    number: 1,
    title: "Forward or send emails to document@cpaautomation.ai",
    description: "Any email with PDF attachments automatically triggers processing",
  },
  {
    number: 2,
    title: "AI extracts data using your templates",
    description: "Custom fields, prompts, and rules you've configured",
  },
  {
    number: 3,
    title: "Results auto-exported to Google Drive",
    description: "CSV and Excel files delivered exactly where you need them",
  },
];

export default function AutomationFlow({ onGetStarted }: AutomationFlowProps) {
  return (
    <section className="py-20 bg-blue-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Set It and Forget It Automation</h2>
          <p className="text-xl text-gray-600">Email attachments → AI extraction → Automated delivery. Zero manual work.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Email-Triggered Processing</h3>
            <div className="space-y-4">
              {steps.map((step) => (
                <motion.div key={step.number} className="flex items-start space-x-4" variants={staggerChild}>
                  <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex-shrink-0 flex items-center justify-center text-sm font-bold">
                    {step.number}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{step.title}</h4>
                    <p className="text-gray-600">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div className="mt-8 p-4 bg-white rounded-lg border border-blue-200" variants={staggerChild}>
              <p className="text-sm text-gray-600 mb-2"><strong>Popular automation filters:</strong></p>
              <div className="space-y-1 text-sm">
                <code className="bg-gray-100 px-2 py-1 rounded">subject:invoice has:attachment</code><br />
                <code className="bg-gray-100 px-2 py-1 rounded">from:vendor@company.com filename:pdf</code><br />
                <code className="bg-gray-100 px-2 py-1 rounded">subject:&quot;monthly report&quot; has:attachment</code>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            className="bg-white rounded-xl shadow-lg p-6"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bot className="text-blue-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Live Demo</h4>
              <p className="text-gray-600 text-sm mb-4">Send a sample invoice to document@cpaautomation.ai and watch it get processed in real-time</p>
              <Button onClick={onGetStarted} className="bg-lido-green hover:bg-lido-green-dark text-white">
                Try Automation Now →
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
