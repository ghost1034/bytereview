'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, MapPinCheck, Lock, Ban } from "lucide-react";
import { fadeInUp, staggerContainer, staggerChild, viewportOnce } from "@/lib/animations";

const badges = [
  { icon: Shield, label: "TLS 1.3 Encryption", color: "bg-blue-100 text-blue-600" },
  { icon: MapPinCheck, label: "US-Only Hosting", color: "bg-green-100 text-green-600" },
  { icon: Lock, label: "AES-256 at Rest", color: "bg-purple-100 text-purple-600" },
  { icon: Ban, label: "Zero Data Training", color: "bg-red-100 text-red-600" },
];

export default function SecurityTrust() {
  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-10"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Enterprise-Grade Security & Compliance</h2>
          <p className="text-gray-600">Your data security is our top priority. Built for professional services.</p>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {badges.map((b) => {
            const Icon = b.icon;
            return (
              <motion.div key={b.label} className="text-center" variants={staggerChild}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${b.color}`}>
                  <Icon className="w-7 h-7" />
                </div>
                <p className="text-sm font-medium text-gray-900">{b.label}</p>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div
          className="text-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <p className="text-sm text-gray-600 mb-4">
            GDPR & CCPA compliant. Meets CPA firm and legal industry security standards.
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
