import { Card, CardContent } from "@/components/ui/card";
import { FileText, Shield, CreditCard, Users, AlertTriangle, Mail } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Terms of Service</h1>
          <p className="text-xl text-gray-600">
            Legal terms and conditions for using ian.ai
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Last updated: January 2024
          </p>
        </div>

        {/* Acceptance */}
        <section className="mb-12">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-8">
              <div className="flex items-start space-x-4">
                <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Acceptance of Terms</h2>
                  <p className="text-gray-700 mb-4">
                    By accessing or using ian.ai's document processing services, you agree to be bound by these Terms of Service. 
                    If you do not agree to these terms, please do not use our services.
                  </p>
                  <p className="text-gray-700">
                    These terms constitute a legal agreement between you and ian.ai regarding your use of our platform.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Service Description */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Service Description</h2>
          
          <Card>
            <CardContent className="p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">What We Provide</h3>
              <ul className="space-y-3 text-gray-600">
                <li>• AI-powered document data extraction services</li>
                <li>• Custom extraction rule creation and templates</li>
                <li>• Professional-grade processing developed by CPAs and lawyers</li>
                <li>• Export capabilities to Excel, Google Sheets, and CSV formats</li>
                <li>• API access for integration with your existing systems</li>
                <li>• Customer support and technical assistance</li>
              </ul>
              
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800 text-sm">
                  <strong>Service Availability:</strong> We strive to maintain 99.9% uptime but cannot guarantee uninterrupted service. 
                  Scheduled maintenance will be announced in advance when possible.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* User Responsibilities */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">User Responsibilities</h2>
          
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-green-100 w-10 h-10 rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Account Security</h3>
                </div>
                <ul className="space-y-2 text-gray-600">
                  <li>• Maintain the confidentiality of your account credentials</li>
                  <li>• Notify us immediately of any unauthorized account access</li>
                  <li>• Use strong passwords and enable two-factor authentication when available</li>
                  <li>• Do not share your API keys or account access with unauthorized parties</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-purple-100 w-10 h-10 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Document Upload Requirements</h3>
                </div>
                <ul className="space-y-2 text-gray-600">
                  <li>• Only upload documents you own or have permission to process</li>
                  <li>• Ensure documents do not contain malware or malicious code</li>
                  <li>• Comply with all applicable laws regarding document processing</li>
                  <li>• Do not upload documents containing illegal content</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-orange-100 w-10 h-10 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-orange-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Acceptable Use</h3>
                </div>
                <ul className="space-y-2 text-gray-600">
                  <li>• Use the service only for legitimate business purposes</li>
                  <li>• Do not attempt to reverse engineer or compromise our systems</li>
                  <li>• Respect usage limits based on your subscription plan</li>
                  <li>• Do not use the service to process documents for competitive analysis</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Billing and Payments */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Billing and Payments</h2>
          
          <Card>
            <CardContent className="p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Terms</h3>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Subscription Plans</h4>
                  <p className="text-gray-600 mb-3">
                    Monthly subscriptions are billed in advance on the same day each month. Annual plans are billed annually in advance.
                  </p>
                  <ul className="space-y-1 text-gray-600 text-sm">
                    <li>• Basic Plan: $9.99/month for 50 pages</li>
                    <li>• Professional Plan: $49.99/month for 1,000 pages</li>
                    <li>• Enterprise Plan: Custom pricing with unlimited pages and users</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Payment Processing</h4>
                  <p className="text-gray-600">
                    Payments are processed securely through our payment providers. We accept major credit cards and ACH transfers for enterprise accounts.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Refunds and Cancellations</h4>
                  <p className="text-gray-600">
                    You may cancel your subscription at any time. Cancellations take effect at the end of your current billing period. 
                    We do not provide refunds for partial months or unused pages.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Late Payments</h4>
                  <p className="text-gray-600">
                    Accounts with failed payments may be suspended after 7 days. Service will be restored upon successful payment.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Intellectual Property */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Intellectual Property</h2>
          
          <Card>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Our Rights</h3>
                  <p className="text-gray-600">
                    ian.ai retains all rights to our software, algorithms, AI models, and extraction methodologies. 
                    Users receive a license to use our services but do not acquire ownership rights.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Rights</h3>
                  <p className="text-gray-600">
                    You retain all rights to your uploaded documents and extracted data. We do not claim ownership 
                    of your content and will not use it for any purpose other than providing our services.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">License Grant</h3>
                  <p className="text-gray-600">
                    You grant us a limited license to process your documents solely for the purpose of providing extraction services. 
                    This license terminates when files are deleted from our systems.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Limitations and Disclaimers */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Limitations and Disclaimers</h2>
          
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="bg-yellow-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Disclaimers</h3>
                </div>
              </div>

              <div className="space-y-4 text-gray-700">
                <div>
                  <h4 className="font-semibold mb-2">Accuracy Disclaimer</h4>
                  <p>
                    While our AI extraction is designed and validated by CPAs and lawyers, we cannot guarantee 100% accuracy. 
                    Users should review and verify extracted data before using it for business decisions.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Service Availability</h4>
                  <p>
                    We provide services on an "as is" basis and cannot guarantee uninterrupted access. 
                    Maintenance, updates, or technical issues may temporarily affect service availability.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Limitation of Liability</h4>
                  <p>
                    Our liability is limited to the amount paid for services in the preceding 12 months. 
                    We are not liable for indirect, incidental, or consequential damages.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Termination */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Termination</h2>
          
          <Card>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">User-Initiated Termination</h3>
                  <p className="text-gray-600">
                    You may terminate your account at any time through your dashboard settings or by contacting support. 
                    Upon termination, your data will be deleted within 30 days.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Service-Initiated Termination</h3>
                  <p className="text-gray-600">
                    We may suspend or terminate accounts for violation of these terms, illegal activity, 
                    or non-payment. We will provide notice when possible before termination.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Effect of Termination</h3>
                  <p className="text-gray-600">
                    Upon termination, your access to the service will cease immediately. 
                    You may export your data before termination, as we cannot guarantee data availability afterward.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Governing Law */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Governing Law</h2>
          
          <Card>
            <CardContent className="p-8">
              <p className="text-gray-600 mb-4">
                These Terms of Service are governed by the laws of the United States. Any disputes will be resolved 
                through binding arbitration in accordance with the rules of the American Arbitration Association.
              </p>
              <p className="text-gray-600">
                If any provision of these terms is found to be unenforceable, the remaining provisions will remain in full force and effect.
              </p>
            </CardContent>
          </Card>
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
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Questions About These Terms?</h2>
                  <p className="text-gray-600 mb-4">
                    If you have questions about these Terms of Service, please contact us:
                  </p>
                  <div className="space-y-2 text-gray-600">
                    <p>Email: legal@ian.ai</p>
                    <p>Phone: 1-800-IAN-HELP</p>
                    <p>Address: United States (US-based legal team)</p>
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
              <h2 className="text-xl font-bold text-gray-900 mb-4">Terms Updates</h2>
              <p className="text-gray-600">
                We may update these Terms of Service from time to time. Material changes will be communicated 
                via email and posted on our website 30 days before taking effect. Continued use of our services 
                after changes indicates acceptance of the updated terms.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}