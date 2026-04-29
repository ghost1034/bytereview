'use client'

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, User, ChevronDown, FileText, PenTool, Clock, Bot, BarChart3, FolderKanban, Files } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/auth/AuthModal";

const productLinks = [
  {
    label: "Document Analysis",
    href: "/#extraction-features",
    description: "AI extraction & automations",
    icon: FileText,
  },
  {
    label: "Form Fill",
    href: "/#form-fill-showcase",
    description: "AI form filling from your documents",
    icon: Files,
  },
  {
    label: "Inkwise",
    href: "/#inkwise-showcase",
    description: "AI writing with citations",
    icon: PenTool,
  },
  {
    label: "Chrona",
    href: "/#chrona-showcase",
    description: "AI time tracking",
    icon: Clock,
    badge: "Soon",
  },
  {
    label: "Claw Series",
    href: "/#claw-showcase",
    description: "AI digital workers",
    icon: Bot,
    badge: "Soon",
  },
  {
    label: "AI Analysis Suite",
    href: "/#roadmap",
    description: "Reconciliation & flux analysis",
    icon: BarChart3,
    badge: "Soon",
  },
  {
    label: "AI Productivity Suite",
    href: "/#roadmap",
    description: "Project management & more",
    icon: FolderKanban,
    badge: "Soon",
  },
];

export default function Header() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const productsRef = useRef<HTMLDivElement>(null);
  const { user, loading, requiresMfaEnrollment, signOut } = useAuth();

  // Close products dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productsRef.current && !productsRef.current.contains(e.target as Node)) {
        setIsProductsOpen(false);
      }
    }
    if (isProductsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isProductsOpen]);

  const primaryAuthenticatedHref = requiresMfaEnrollment ? "/complete-signup" : "/dashboard";
  const primaryAuthenticatedLabel = requiresMfaEnrollment ? "Secure Sign-In" : "Dashboard";

  const handleAuthAction = () => {
    if (user) {
      signOut();
    } else {
      setIsAuthModalOpen(true);
    }
  };

  const navLinkClass = (path: string) =>
    `text-gray-700 hover:text-lido-blue transition-colors ${pathname === path ? 'text-lido-blue' : ''}`;

  return (
    <nav className="app-header fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white transition-transform duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-[var(--header-height)]">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center cursor-pointer">
              <Image
                src="/logo.png"
                alt="CPAAutomation Logo"
                width={240}
                height={80}
                className="h-10 w-auto"
              />
            </Link>

            <div className="hidden md:flex items-center space-x-6">
              {user && (
                <Link href={primaryAuthenticatedHref} className={navLinkClass(primaryAuthenticatedHref)}>
                  {primaryAuthenticatedLabel}
                </Link>
              )}

              {/* Products dropdown */}
              <div
                ref={productsRef}
                className="relative"
                onMouseEnter={() => setIsProductsOpen(true)}
                onMouseLeave={() => setIsProductsOpen(false)}
              >
                <button className="flex items-center gap-1 text-gray-700 hover:text-lido-blue transition-colors">
                  Products
                  <ChevronDown className={`w-4 h-4 transition-transform ${isProductsOpen ? 'rotate-180' : ''}`} />
                </button>

                {isProductsOpen && (
                  <div className="absolute top-full left-0 pt-2">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-2 w-64">
                      {productLinks.map((p) => {
                        const Icon = p.icon;
                        return (
                          <Link
                            key={p.label}
                            href={p.href}
                            className="flex items-start gap-3 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                            onClick={() => setIsProductsOpen(false)}
                          >
                            <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Icon className="w-4 h-4 text-gray-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">{p.label}</span>
                                {p.badge && (
                                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                    {p.badge}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">{p.description}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <Link href="/demo" className={navLinkClass('/demo')}>
                Demo
              </Link>
              <Link href="/pricing" className={navLinkClass('/pricing')}>
                Pricing
              </Link>
              <Link href="/about" className={navLinkClass('/about')}>
                About
              </Link>
              <Link href="/contact" className={navLinkClass('/contact')}>
                Contact
              </Link>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-700">{user.displayName || user.email}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAuthAction}
                  className="flex items-center space-x-1"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </Button>
              </div>
            ) : (
              <Button
                className="lido-blue hover:lido-blue-dark text-white"
                onClick={handleAuthAction}
                disabled={loading}
              >
                {loading ? "Loading..." : "Sign In"}
              </Button>
            )}
          </div>

          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-4">
            <div className="space-y-1">
              {/* Mobile Products section */}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 pt-2 pb-1">Products</p>
              {productLinks.map((p) => {
                const Icon = p.icon;
                return (
                  <Link
                    key={p.label}
                    href={p.href}
                    className="flex items-center gap-3 text-gray-700 hover:text-lido-blue py-2 px-2 rounded-lg hover:bg-gray-50"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Icon className="w-4 h-4 text-gray-500" />
                    <span>{p.label}</span>
                    {p.badge && (
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded ml-auto">
                        {p.badge}
                      </span>
                    )}
                  </Link>
                );
              })}

              <div className="border-t border-gray-100 my-2" />

              <Link href="/demo" className="block text-gray-700 hover:text-lido-blue py-2 px-2" onClick={() => setIsMobileMenuOpen(false)}>
                Demo
              </Link>
              <Link href="/pricing" className="block text-gray-700 hover:text-lido-blue py-2 px-2" onClick={() => setIsMobileMenuOpen(false)}>
                Pricing
              </Link>
              <Link href="/about" className="block text-gray-700 hover:text-lido-blue py-2 px-2" onClick={() => setIsMobileMenuOpen(false)}>
                About
              </Link>
              <Link href="/contact" className="block text-gray-700 hover:text-lido-blue py-2 px-2" onClick={() => setIsMobileMenuOpen(false)}>
                Contact
              </Link>
            </div>
            <div className="space-y-2">
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-sm text-gray-700">{user.displayName || user.email}</span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full flex items-center justify-center space-x-2"
                    onClick={handleAuthAction}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full lido-blue hover:lido-blue-dark text-white"
                  onClick={handleAuthAction}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Sign In"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </nav>
  );
}
