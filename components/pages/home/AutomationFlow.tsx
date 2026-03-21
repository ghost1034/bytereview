'use client'

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Mail, Bot, FolderOutput } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

interface AutomationFlowProps {
  onGetStarted: () => void;
}

const steps = [
  {
    number: 1,
    icon: Mail,
    iconBg: "bg-gradient-to-br from-blue-500 to-blue-600",
    title: "Forward or send emails to document@cpaautomation.ai",
    description: "Any email with PDF attachments automatically triggers processing",
  },
  {
    number: 2,
    icon: Bot,
    iconBg: "bg-gradient-to-br from-purple-500 to-purple-600",
    title: "AI extracts data using your templates",
    description: "Custom fields, prompts, and rules you've configured",
  },
  {
    number: 3,
    icon: FolderOutput,
    iconBg: "bg-gradient-to-br from-green-500 to-green-600",
    title: "Results auto-exported to Google Drive",
    description: "CSV and Excel files delivered exactly where you need them",
  },
];

const filters = [
  "subject:invoice has:attachment",
  "from:vendor@company.com filename:pdf",
  'subject:"monthly report" has:attachment',
];

export default function AutomationFlow({ onGetStarted }: AutomationFlowProps) {
  return (
    <section className="py-24 bg-blue-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <span className="inline-block text-sm font-medium text-blue-600 bg-blue-100 px-3 py-1 rounded-full mb-4">
            Automations
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Set It and Forget It</h2>
          <p className="text-xl text-gray-600">Email attachments → AI extraction → Automated delivery. Zero manual work.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Pipeline steps */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <div className="space-y-1">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.number}>
                    <motion.div
                      className="flex items-start space-x-4 p-4 rounded-xl bg-white border border-gray-200 shadow-sm"
                      variants={staggerChild}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${step.iconBg}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="pt-0.5">
                        <h4 className="font-semibold text-gray-900">{step.title}</h4>
                        <p className="text-sm text-gray-600 mt-0.5">{step.description}</p>
                      </div>
                    </motion.div>
                    {/* Connector */}
                    {i < steps.length - 1 && (
                      <motion.div
                        className="flex justify-start ml-9 my-0"
                        variants={staggerChild}
                      >
                        <div className="w-px h-6 border-l-2 border-dashed border-gray-300" />
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Filters */}
            <motion.div
              className="mt-6 p-5 bg-white rounded-xl border border-gray-200 shadow-sm"
              variants={staggerChild}
            >
              <p className="text-sm font-semibold text-gray-900 mb-3">Popular automation filters</p>
              <div className="space-y-2">
                {filters.map((f) => (
                  <div key={f} className="font-mono text-xs bg-gray-900 text-green-400 px-3 py-2 rounded-lg">
                    {f}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          {/* CTA card */}
          <motion.div
            className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 lg:sticky lg:top-24"
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center bg-blue-50/30">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <Bot className="text-blue-600 w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">Try It Live</h4>
              <p className="text-gray-600 text-sm mb-6">
                Send a sample invoice to document@cpaautomation.ai and watch it get processed in real-time.
              </p>
              <Button
                onClick={onGetStarted}
                className="bg-lido-green hover:bg-lido-green-dark text-white px-6"
              >
                Try Automation Now →
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
