'use client'

import { useState } from 'react'
import { Clock, Mail, MapPin, Phone, Send } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FeatureCard } from '@/components/marketing/feature-card'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { Section } from '@/components/ui/section'
import { apiClient } from '@/lib/api'

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    subject: '',
    message: '',
    inquiryType: '',
  })

  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMessage(null)
    try {
      if (!formData.inquiryType) {
        throw new Error('Please select an inquiry type')
      }
      await apiClient.submitContact(formData as any)
      setStatus('success')
      setFormData({
        name: '',
        email: '',
        company: '',
        subject: '',
        message: '',
        inquiryType: '',
      })
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(err.message || 'Failed to submit')
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <>
      <MarketingHero
        backdrop="plain"
        width="narrow"
        title="Contact us"
        description="Get in touch with our team of CPAs and legal professionals."
      />

      <section className="bg-background pb-16 pt-8 sm:pb-20 sm:pt-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <Section variant="card" title="Send us a message">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name">Full name *</Label>
                    <Input
                      id="contact-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange('name', e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-email">Work email *</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        handleInputChange('email', e.target.value)
                      }
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-company">Company</Label>
                  <Input
                    id="contact-company"
                    type="text"
                    value={formData.company}
                    onChange={(e) =>
                      handleInputChange('company', e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-inquiry">Inquiry type</Label>
                  <Select
                    value={formData.inquiryType}
                    onValueChange={(value) =>
                      handleInputChange('inquiryType', value)
                    }
                  >
                    <SelectTrigger id="contact-inquiry">
                      <SelectValue placeholder="Select inquiry type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales &amp; pricing</SelectItem>
                      <SelectItem value="support">Technical support</SelectItem>
                      <SelectItem value="enterprise">
                        Enterprise solutions
                      </SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="general">General questions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-subject">Subject *</Label>
                  <Input
                    id="contact-subject"
                    type="text"
                    value={formData.subject}
                    onChange={(e) =>
                      handleInputChange('subject', e.target.value)
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-message">Message *</Label>
                  <Textarea
                    id="contact-message"
                    rows={6}
                    value={formData.message}
                    onChange={(e) =>
                      handleInputChange('message', e.target.value)
                    }
                    placeholder="Tell us about your document processing needs…"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full"
                >
                  <Send className="mr-1.5 size-4" aria-hidden />
                  {status === 'submitting' ? 'Sending…' : 'Send message'}
                </Button>
                {status === 'success' && (
                  <Alert>
                    <AlertDescription className="text-success">
                      Thanks! Your message has been sent.
                    </AlertDescription>
                  </Alert>
                )}
                {status === 'error' && (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}
              </form>
            </Section>

            <div className="space-y-6">
              <Section variant="card" title="Get in touch">
                <div className="space-y-3">
                  <FeatureCard
                    icon={Mail}
                    tone="brand"
                    title="Email"
                    description={
                      <>
                        <span className="block">
                          Tech: support@CPAAutomation.ai
                        </span>
                        <span className="block">
                          Sales: sales@CPAAutomation.ai
                        </span>
                      </>
                    }
                  />
                  <FeatureCard
                    icon={Phone}
                    tone="success"
                    title="Phone"
                    description={
                      <>
                        <span className="block">Tech: (415) 680-5881</span>
                        <span className="block">Sales: (513) 593-1883</span>
                      </>
                    }
                  />
                  <FeatureCard
                    icon={MapPin}
                    tone="info"
                    title="Office"
                    description={
                      <>
                        <span className="block">United States</span>
                        <span className="block">US-based support team</span>
                      </>
                    }
                  />
                  <FeatureCard
                    icon={Clock}
                    tone="warning"
                    title="Business hours"
                    description={
                      <>
                        <span className="block">
                          Monday – Friday: 9:00 AM – 6:00 PM EST
                        </span>
                        <span className="block">Enterprise support: 24/7</span>
                      </>
                    }
                  />
                </div>
              </Section>

              <Section
                variant="card"
                className="bg-surface-muted"
                title="Enterprise solutions"
                description="Need custom integrations, dedicated support, or volume processing? Our enterprise team specializes in large-scale document workflows."
              >
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full">
                      Schedule enterprise consultation
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Enterprise consultation</DialogTitle>
                      <DialogDescription>
                        For enterprise inquiries, please contact our lead
                        developer or legal expert directly:
                      </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-2">
                      <div>
                        <span className="text-foreground-muted">
                          Lead developer:
                        </span>
                        <a
                          href="mailto:ianstewart@cpaautomation.ai"
                          className="ml-1 inline text-primary underline-offset-4 hover:underline"
                        >
                          ianstewart@cpaautomation.ai
                        </a>
                      </div>
                      <div>
                        <span className="text-foreground-muted">
                          Legal expert:
                        </span>
                        <a
                          href="mailto:raysang@cpaautomation.ai"
                          className="ml-1 inline text-primary underline-offset-4 hover:underline"
                        >
                          raysang@cpaautomation.ai
                        </a>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </Section>

              <Section variant="card" title="Quick links">
                <div className="space-y-2">
                  <a
                    href="/demo"
                    className="block text-sm text-primary underline-offset-4 hover:underline"
                  >
                    View demo videos
                  </a>
                  <a
                    href="/pricing"
                    className="block text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Pricing plans
                  </a>
                </div>
              </Section>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
