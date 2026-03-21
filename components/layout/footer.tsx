import Link from "next/link";
import { FaLinkedin } from "react-icons/fa";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4">
              <span className="text-xl font-bold">CPAAutomation</span>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              The AI platform for accounting, finance, and legal professionals.
            </p>
            <div className="flex space-x-4">
              <a
                href="https://www.linkedin.com/company/cpa-automation-inc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <FaLinkedin className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Products */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Products</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/features" className="text-gray-400 hover:text-white transition-colors">
                  Document Analysis
                </Link>
              </li>
              <li>
                <Link href="/dashboard/inkwise" className="text-gray-400 hover:text-white transition-colors">
                  Inkwise
                </Link>
              </li>
              <li>
                <span className="text-gray-500">
                  Chrona <span className="text-xs text-gray-600">(Soon)</span>
                </span>
              </li>
              <li>
                <Link href="/dashboard/cpe-tracker" className="text-gray-400 hover:text-white transition-colors">
                  CPE Tracker
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/demo" className="text-gray-400 hover:text-white transition-colors">
                  Demo
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/case-study/LFO" className="text-gray-400 hover:text-white transition-colors">
                  Case Study
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Company</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-gray-400 hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-gray-400 hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 text-center">
          <p className="text-gray-500 text-sm">&copy; 2026 CPA Automation, Inc. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
