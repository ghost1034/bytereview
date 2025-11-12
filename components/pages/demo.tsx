'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AuthModal from "@/components/auth/AuthModal";

export default function Demo() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleSignUp = () => {
    setIsAuthModalOpen(true);
  };

  return (
    <div>
      {/* Demo Section: Videos + CTA as one full-viewport block */}
      <section className="bg-white min-h-[calc(100vh-var(--header-height))] flex items-center py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">See CPAAutomation in Action</h1>
            <p className="text-xl text-gray-600">Watch how our AI extracts data from financial documents with professional accuracy</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div>
              <h3 className="text-lg font-bold mb-3 text-gray-900">Featured: Bank Statement Analysis</h3>
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative bg-black aspect-video">
                    <iframe
                      className="absolute inset-0 w-full h-full border-0"
                      loading="lazy"
                      src="https://www.youtube-nocookie.com/embed/mxDEliIRWtc?si=brPvZMmN0F5Tbeeh"
                      title="CPAAutomation.ai Tutorial #1: Bank Statement Analysis"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900">Invoice Extraction and Contract Review</h3>
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative bg-black aspect-video">
                    <iframe
                      className="absolute inset-0 w-full h-full border-0"
                      loading="lazy"
                      src="https://www.youtube-nocookie.com/embed/uWA5ds9VuPM?si=DxjCBqrxZ997eF5A"
                      title="Invoice Line Extraction and Revenue Contract Review"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900">Email and Google Drive Automation Setup</h3>
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative bg-black aspect-video">
                    <iframe
                      className="absolute inset-0 w-full h-full border-0"
                      loading="lazy"
                      src="https://www.youtube-nocookie.com/embed/R0ubnn4ggGA?si=XZ6cP69kg5JqebIT"
                      title="Gmail and Google Drive Automation Setup"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* CTA below videos, same section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Try CPAAutomation Yourself</h2>
            <p className="text-lg text-gray-600 mb-6">
              Create a free account to upload documents, connect Gmail or Google Drive, run automations, and see results in your dashboard.
            </p>
            <Button 
              className="bg-blue-500 text-white hover:bg-blue-600"
              onClick={handleSignUp}
            >
              Sign Up for Free Account
            </Button>
          </div>
        </div>
      </section>
      
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        defaultTab="signup"
      />
    </div>
  );
}