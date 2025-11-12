'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import { apiClient } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    subject: "",
    message: "",
    inquiryType: ""
  });

  const [status, setStatus] = useState<'idle'|'submitting'|'success'|'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting')
    setErrorMessage(null)
    try {
      if (!formData.inquiryType) {
        throw new Error('Please select an inquiry type')
      }
      await apiClient.submitContact(formData as any) // types generated from OpenAPI

      setStatus('success')
      // Clear the form
      setFormData({ name: '', email: '', company: '', subject: '', message: '', inquiryType: '' })
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(err.message || 'Failed to submit')
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Contact Us</h1>
          <p className="text-xl text-gray-600">
            Get in touch with our team of CPA and legal professionals
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Send us a message</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <Input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Work Email *
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company
                  </label>
                  <Input
                    type="text"
                    value={formData.company}
                    onChange={(e) => handleInputChange("company", e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Inquiry Type
                  </label>
                  <Select value={formData.inquiryType} onValueChange={(value) => handleInputChange("inquiryType", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inquiry type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales & Pricing</SelectItem>
                      <SelectItem value="support">Technical Support</SelectItem>
                      <SelectItem value="enterprise">Enterprise Solutions</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="general">General Questions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject *
                  </label>
                  <Input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => handleInputChange("subject", e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message *
                  </label>
                  <Textarea
                    rows={6}
                    value={formData.message}
                    onChange={(e) => handleInputChange("message", e.target.value)}
                    placeholder="Tell us about your document processing needs..."
                    required
                  />
                </div>

                <Button type="submit" disabled={status==='submitting'} className="w-full lido-green hover:lido-green-dark text-white">
                  <Send className="w-4 h-4 mr-2" />
                  {status==='submitting' ? 'Sending...' : 'Send Message'}
                </Button>
                {status==='success' && (
                  <p className="text-green-600 text-sm mt-2">Thanks! Your message has been sent.</p>
                )}
                {status==='error' && (
                  <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <div className="space-y-8">
            <Card>
              <CardContent className="p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Get in Touch</h3>
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Email</h4>
                      <p className="text-gray-600">Tech: support@CPAAutomation.ai</p>
                      <p className="text-gray-600">Sales: sales@CPAAutomation.ai</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Phone className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Phone</h4>
                      <p className="text-gray-600">Tech: (415) 680-5881</p>
                      <p className="text-gray-600">Sales: (513) 593-1883</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="bg-purple-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Office</h4>
                      <p className="text-gray-600">United States</p>
                      <p className="text-gray-600">US-based support team</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="bg-orange-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Clock className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Business Hours</h4>
                      <p className="text-gray-600">Monday - Friday: 9:00 AM - 6:00 PM EST</p>
                      <p className="text-gray-600">Enterprise support: 24/7</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Enterprise Contact */}
            <Card className="bg-gray-50">
              <CardContent className="p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Enterprise Solutions</h3>
                <p className="text-gray-600 mb-6">
                  Need custom integrations, dedicated support, or volume processing? 
                  Our enterprise team specializes in large-scale document workflows.
                </p>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white">
                      Schedule Enterprise Consultation
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Enterprise Consultation</DialogTitle>
                      <DialogDescription>
                        For enterprise inquiries, please contact our lead developer or legal expert directly:
                      </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-2">
                      <div>
                        <span className="text-gray-700">Lead developer:</span>
                        <a href="mailto:ianstewart@cpaautomation.ai" className="ml-1 inline text-blue-600 hover:text-blue-800 underline">
                          ianstewart@cpaautomation.ai
                        </a>
                      </div>
                      <div>
                        <span className="text-gray-700">Legal expert:</span>
                        <a href="mailto:raysang@cpaautomation.ai" className="ml-1 inline text-blue-600 hover:text-blue-800 underline">
                          raysang@cpaautomation.ai
                        </a>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardContent className="p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Quick Links</h3>
                <div className="space-y-3">
                  <a href="/demo" className="block text-blue-600 hover:text-blue-800 transition-colors">
                    View Demo Videos
                  </a>
                  <a href="/documentation" className="block text-blue-600 hover:text-blue-800 transition-colors">
                    Documentation & API
                  </a>
                  <a href="/pricing" className="block text-blue-600 hover:text-blue-800 transition-colors">
                    Pricing Plans
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}