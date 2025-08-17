'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play } from "lucide-react";
import AuthModal from "@/components/auth/AuthModal";

export default function Demo() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleSignUp = () => {
    setIsAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen py-20">
      {/* Video Demo Section */}
      <section className="bg-white py-16 mb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">See CPAAutomation in Action</h1>
          <p className="text-xl text-gray-600 mb-8">Watch how our AI extracts data from financial documents with professional accuracy</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Video Placeholder 1 */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative bg-gray-100 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Invoice Processing Demo</p>
                    <p className="text-sm text-gray-500">Video placeholder - Add video link here</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Video Placeholder 2 */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative bg-gray-100 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Custom Rules Setup</p>
                    <p className="text-sm text-gray-500">Video placeholder - Add video link here</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Interactive Demo Coming Soon
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            We're working on an interactive demo experience. For now, you can sign up for an account to experience CPAAutomation directly.
          </p>
          
          <div className="flex items-center justify-center space-x-4">
            <Button 
              className="bg-blue-500 text-white hover:bg-blue-600"
              onClick={handleSignUp}
            >
              Sign Up for Free Account
            </Button>
          </div>
        </div>
      </div>
      
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        defaultTab="signup"
      />
    </div>
  );
}