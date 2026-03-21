'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, MapPinCheck, Lock, Ban, Check } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const badges = [
  {
    icon: Shield,
    iconBg: "bg-gradient-to-br from-blue-100 to-blue-50",
    iconText: "text-blue-600",
    label: "TLS 1.3 Encryption",
    detail: "All data transfers use the latest encryption protocols",
  },
  {
    icon: MapPinCheck,
    iconBg: "bg-gradient-to-br from-green-100 to-green-50",
    iconText: "text-green-600",
    label: "US-Only Hosting",
    detail: "Google Cloud US regions with SOC 2 compliance",
  },
  {
    icon: Lock,
    iconBg: "bg-gradient-to-br from-purple-100 to-purple-50",
    iconText: "text-purple-600",
    label: "AES-256 at Rest",
    detail: "Military-grade encryption for stored data",
  },
  {
    icon: Ban,
    iconBg: "bg-gradient-to-br from-red-100 to-red-50",
    iconText: "text-red-600",
    label: "Zero Data Training",
    detail: "Your documents never train AI models",
  },
];

const compliance = [
  "GDPR compliant",
  "CCPA compliant",
  "Automatic data deletion after processing",
  "Meets CPA firm security requirements",
  "Legal industry standards",
  "Full audit logs for all activities",
];

export default function SecurityTrust() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <span className="inline-block text-sm font-medium text-gray-600 bg-gray-200 px-3 py-1 rounded-full mb-4">
            Security & Compliance
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Enterprise-Grade Security</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Your data security is our top priority. Built for the standards professional services demand.
          </p>
        </motion.div>

        {/* Badge cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {badges.map((b) => {
            const Icon = b.icon;
            return (
              <motion.div
                key={b.label}
                className="bg-white rounded-xl border border-gray-200 p-5 text-center"
                variants={staggerChild}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${b.iconBg}`}>
                  <Icon className={`w-6 h-6 ${b.iconText}`} />
                </div>
                <p className="text-sm font-semibold text-gray-900">{b.label}</p>
                <p className="text-xs text-gray-500 mt-1">{b.detail}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Compliance checklist */}
        <motion.div
          className="bg-white rounded-xl border border-gray-200 p-6 mb-8"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {compliance.map((item) => (
              <div key={item} className="flex items-center space-x-2 text-sm">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <p className="text-sm text-gray-500 mb-4">
            Need enterprise security documentation or custom compliance requirements?
          </p>
          <Link href="/contact">
            <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100">
              Contact Security Team →
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
