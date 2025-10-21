"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCookieConsentContext } from './CookieConsentProvider';
import { useEffect, useState } from 'react';

export default function CookiePreferencesModal() {
  const { isPreferencesOpen, closePreferences, consent, savePreferences, resetPreferences } = useCookieConsentContext();
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (consent) {
      setAnalytics(!!consent.analytics);
      setFunctional(!!consent.functional);
      setMarketing(!!consent.marketing);
    }
  }, [consent, isPreferencesOpen]);

  const handleSave = () => {
    savePreferences({ analytics, functional, marketing });
  };

  const handleReset = () => {
    setAnalytics(false);
    setFunctional(false);
    setMarketing(false);
    resetPreferences();
  };

  return (
    <Dialog open={isPreferencesOpen} onOpenChange={closePreferences}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cookie Preferences</DialogTitle>
          <DialogDescription>
            These settings apply to this browser and device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="border rounded p-3">
            <h4 className="font-medium mb-1">Necessary Cookies</h4>
            <p className="text-sm text-gray-600 mb-2">Required for basic site functionality, security, and user authentication. These cannot be disabled.</p>
            <div className="flex items-center justify-between">
              <span className="text-sm">Required</span>
              <Switch checked disabled aria-readonly />
            </div>
          </section>

          <section className="border rounded p-3">
            <h4 className="font-medium mb-1">Analytics Cookies</h4>
            <p className="text-sm text-gray-600 mb-2">Help us understand how visitors interact with our website to improve user experience.</p>
            <div className="flex items-center justify-between">
              <span className="text-sm">{analytics ? 'Enabled' : 'Disabled'}</span>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>
          </section>

          <section className="border rounded p-3">
            <h4 className="font-medium mb-1">Functional Cookies</h4>
            <p className="text-sm text-gray-600 mb-2">Enable enhanced functionality like video playback and social media features.</p>
            <div className="flex items-center justify-between">
              <span className="text-sm">{functional ? 'Enabled' : 'Disabled'}</span>
              <Switch checked={functional} onCheckedChange={setFunctional} />
            </div>
          </section>

          <section className="border rounded p-3">
            <h4 className="font-medium mb-1">Marketing Cookies</h4>
            <p className="text-sm text-gray-600 mb-2">Used to deliver personalized advertisements and track advertising effectiveness.</p>
            <div className="flex items-center justify-between">
              <span className="text-sm">{marketing ? 'Enabled' : 'Disabled'}</span>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleReset}>Reset to Default</Button>
          <Button onClick={handleSave}>Save Preferences</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
