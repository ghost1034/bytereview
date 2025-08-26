/**
 * Email Automation Guide Component
 * Explains how the new email-based automation system works
 */
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, ArrowRight, FileText, Download, CheckCircle } from 'lucide-react';

interface EmailAutomationGuideProps {
  className?: string;
}

export function EmailAutomationGuide({ className }: EmailAutomationGuideProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          How Email Automations Work
        </CardTitle>
        <CardDescription>
          Send emails with attachments to trigger automated document processing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step-by-step process */}
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
              1
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Send Email with Attachments</h4>
              <p className="text-sm text-gray-600 mt-1">
                Send or forward emails with PDF attachments to{' '}
                <Badge variant="secondary" className="font-mono">
                  document@cpaautomation.ai
                </Badge>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </div>

          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
              2
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Automatic Matching</h4>
              <p className="text-sm text-gray-600 mt-1">
                System matches your sender email to your account and applies your automation filters
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </div>

          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
              3
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Document Processing</h4>
              <p className="text-sm text-gray-600 mt-1">
                Attachments are automatically processed using your configured extraction template
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </div>

          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 bg-green-100 text-green-600 rounded-full text-sm font-medium">
              4
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Results Delivered</h4>
              <p className="text-sm text-gray-600 mt-1">
                Extracted data is automatically exported to your configured destination (Google Drive, etc.)
              </p>
            </div>
          </div>
        </div>

        {/* Email requirements */}
        <div className="border-t pt-6">
          <h4 className="font-medium text-gray-900 mb-3">Email Requirements</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Send from the same email address used for your Google integration</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Include PDF attachments for processing</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Email content should match your automation filters</span>
            </div>
          </div>
        </div>

        {/* Example filters */}
        <div className="border-t pt-6">
          <h4 className="font-medium text-gray-900 mb-3">Example Filter Queries</h4>
          <div className="space-y-2">
            <div className="bg-gray-50 rounded p-3">
              <code className="text-sm text-gray-800">has:attachment</code>
              <p className="text-xs text-gray-600 mt-1">Process any email with attachments</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <code className="text-sm text-gray-800">subject:invoice has:attachment</code>
              <p className="text-xs text-gray-600 mt-1">Process emails with "invoice" in subject and attachments</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <code className="text-sm text-gray-800">filename:pdf</code>
              <p className="text-xs text-gray-600 mt-1">Process emails with PDF file attachments</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}