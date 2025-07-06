'use client'

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, X, TrendingUp, Calculator, LogOut, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/AuthModal";

export default function Header() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { user, loading, signOut } = useAuth();

  const handleAuthAction = () => {
    if (user) {
      signOut();
    } else {
      setIsAuthModalOpen(true);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-3 cursor-pointer">
              <div className="relative w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <div className="text-white font-bold text-sm">FE</div>
              </div>
              <span className="text-xl font-bold text-gray-900">Financial Extract</span>
            </Link>
            
            <div className="hidden md:flex space-x-6">
              {user ? (
                <Link href="/dashboard" className={`text-gray-700 hover:text-lido-blue transition-colors ${pathname === '/dashboard' ? 'text-lido-blue' : ''}`}>
                  Dashboard
                </Link>
              ) : (
                <Link href="/demo" className={`text-gray-700 hover:text-lido-blue transition-colors ${pathname === '/demo' ? 'text-lido-blue' : ''}`}>
                  Try it
                </Link>
              )}
              <Link href="/pricing" className={`text-gray-700 hover:text-lido-blue transition-colors ${pathname === '/pricing' ? 'text-lido-blue' : ''}`}>
                Pricing
              </Link>
              <Link href="/features" className={`text-gray-700 hover:text-lido-blue transition-colors ${pathname === '/features' ? 'text-lido-blue' : ''}`}>
                Features
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
                {loading ? "Loading..." : "Sign In/Up"}
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
            <div className="space-y-2">
              <Link href="/demo" className="block text-gray-700 hover:text-lido-blue py-2">
                Try it
              </Link>
              <Link href="/pricing" className="block text-gray-700 hover:text-lido-blue py-2">
                Pricing
              </Link>
              <Link href="/features" className="block text-gray-700 hover:text-lido-blue py-2">
                Features
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
                  {loading ? "Loading..." : "Sign In/Up"}
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
