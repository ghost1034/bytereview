import { Card, CardContent } from "@/components/ui/card";
import { Shield, Lock, Trash2, MapPin, FileText, Mail } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
          <p className="text-xl text-gray-600">
            How we protect and handle your data at CPAAutomation
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Last updated: January 2024
          </p>
        </div>

        {/* Overview */}
        <section className="mb-12">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-8">
              <div className="flex items-start space-x-4">
                <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Our Commitment to Privacy</h2>
                  <p className="text-gray-700 mb-4">
                    At CPAAutomation, we understand that your documents contain sensitive financial and legal information. 
                    We are committed to protecting your privacy and maintaining the highest standards of data security.
                  </p>
                  <p className="text-gray-700">
                    This privacy policy explains how we collect, use, and protect your information when you use our document extraction services.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Data Collection */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Information We Collect</h2>
          
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Data</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• PDF files and images you upload for processing</li>
                  <li>• Extracted data and results from your documents</li>
                  <li>• Custom extraction rules and templates you create</li>
                  <li>• Processing metadata (file size, type, processing time)</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Name, email address, and company information</li>
                  <li>• Subscription plan and billing information</li>
                  <li>• Usage statistics and feature preferences</li>
                  <li>• Support communication and feedback</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Data</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• IP address and browser information</li>
                  <li>• Device type and operating system</li>
                  <li>• API usage logs and error reports</li>
                  <li>• Performance and analytics data</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Data Security */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How We Protect Your Data</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-red-100 w-10 h-10 rounded-lg flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Immediate File Deletion</h3>
                </div>
                <p className="text-gray-600">
                  All uploaded files are permanently deleted from our servers immediately after processing is complete. 
                  We do not retain your documents for any purpose.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-blue-100 w-10 h-10 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">US-Only Hosting</h3>
                </div>
                <p className="text-gray-600">
                  All our servers are located exclusively in the United States, ensuring your data remains within 
                  US jurisdiction and subject to US privacy laws.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-purple-100 w-10 h-10 rounded-lg flex items-center justify-center">
                    <Lock className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">AES-256 Encryption</h3>
                </div>
                <p className="text-gray-600">
                  All data is encrypted using industry-standard AES-256 encryption both in transit and at rest, 
                  providing military-grade security for your documents.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-green-100 w-10 h-10 rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Access Controls</h3>
                </div>
                <p className="text-gray-600">
                  Strict access controls limit data access to authorized personnel only, with comprehensive 
                  audit logs of all system access and activities.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Data Use */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How We Use Your Information</h2>
          
          <Card>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Service Provision</h3>
                  <p className="text-gray-600">
                    We use your data solely to provide document extraction services, including processing your files, 
                    delivering results, and maintaining your account.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Service Improvement</h3>
                  <p className="text-gray-600">
                    Anonymous, aggregated usage data helps us improve our AI models and service quality. 
                    No personally identifiable information is used for this purpose.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Customer Support</h3>
                  <p className="text-gray-600">
                    We may access your account information to provide technical support, resolve issues, 
                    and respond to your inquiries.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Legal Compliance</h3>
                  <p className="text-gray-600">
                    We may process data as required by law, regulation, or legal process, but will notify you 
                    when legally permitted to do so.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Data Sharing */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Data Sharing and Third Parties</h2>
          
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">We Do Not Sell Your Data</h3>
              <p className="text-gray-700 mb-6">
                CPAAutomation does not sell, rent, or trade your personal information or document data to third parties 
                for marketing or any other commercial purposes.
              </p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Limited Third-Party Services</h4>
                  <p className="text-gray-600">
                    We may use trusted third-party services for specific functions such as payment processing, 
                    email delivery, and hosting infrastructure. These providers are contractually bound to protect your data.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Business Transfers</h4>
                  <p className="text-gray-600">
                    In the event of a merger, acquisition, or sale of assets, your information may be transferred 
                    as part of the business transaction, subject to the same privacy protections.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Your Rights */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Your Rights and Choices</h2>
          
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Access and Portability</h3>
                <p className="text-gray-600">
                  You have the right to access your account data and export your extraction templates and results 
                  in a portable format at any time.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Correction and Updates</h3>
                <p className="text-gray-600">
                  You can update your account information, preferences, and settings through your dashboard 
                  or by contacting our support team.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Account Deletion</h3>
                <p className="text-gray-600">
                  You may delete your account at any time. Upon deletion, all your data will be permanently 
                  removed from our systems within 30 days.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <Card className="bg-gray-50">
            <CardContent className="p-8">
              <div className="flex items-start space-x-4">
                <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Questions About Your Privacy?</h2>
                  <p className="text-gray-600 mb-4">
                    If you have questions about this privacy policy or how we handle your data, please contact us:
                  </p>
                  <div className="space-y-2 text-gray-600">
                    <p>Email: privacy@CPAAutomation</p>
                    <p>Phone: 1-800-IAN-HELP</p>
                    <p>Address: United States (US-based support team)</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Updates */}
        <section className="text-center">
          <Card>
            <CardContent className="p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Policy Updates</h2>
              <p className="text-gray-600">
                We may update this privacy policy from time to time. We will notify you of any material changes 
                by email and by posting the updated policy on our website. Your continued use of CPAAutomation 
                after such changes constitutes acceptance of the updated policy.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}