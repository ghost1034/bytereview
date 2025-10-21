"use client";

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCookieConsentContext } from './CookieConsentProvider';
import { X } from 'lucide-react';

export default function CookieBanner() {
  const { showBanner, acceptAll, acceptNecessary, openPreferences } = useCookieConsentContext();

  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <Card className="relative mx-auto max-w-5xl shadow-lg border border-gray-200 bg-white">
        <div className="p-4 md:p-6">
          <button
            aria-label="Close cookie banner"
            className="absolute right-3 top-3 text-gray-500 hover:text-gray-700"
            onClick={acceptNecessary}
          >
            <X className="w-4 h-4" />
          </button>
          <h3 className="text-base md:text-lg font-semibold mb-2">We Value Your Privacy</h3>
          <p className="text-sm text-gray-700 mb-3">
            We use cookies to enhance your experience on CPAAutomation, analyze site traffic, and provide personalized content. By clicking
            <span className="font-medium"> "Accept All"</span>, you consent to our use of cookies in accordance with our
            <Link href="/privacy" className="ml-1 underline">Privacy Policy</Link>.
          </p>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-xs text-gray-600">
              You can change your preferences at any time by visiting our Privacy Policy. For more information about our data practices, please see our <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={acceptNecessary}>Accept Necessary Only</Button>
              <Button variant="outline" onClick={openPreferences}>Customize Preferences</Button>
              <Button onClick={acceptAll}>Accept All Cookies</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
