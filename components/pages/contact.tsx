'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  Clock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
} from 'lucide-react'

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
import { cn } from '@/lib/utils'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { GlassCard } from '@/components/pages/home/shared/GlassCard'
import { accent, type Accent } from '@/components/pages/home/shared/tones'
import { staggerChild, staggerContainer, viewportOnce } from '@/lib/animations'
import { apiClient } from '@/lib/api'

const CONTACT_METHODS: {
  icon: React.ComponentType<{ className?: string }>
  tone: Accent
  title: string
  lines: string[]
}[] = [
  {
    icon: Mail,
    tone: 'blue',
    title: 'Email',
    lines: ['Tech: support@CPAAutomation.ai', 'Sales: sales@CPAAutomation.ai'],
  },
  {
    icon: Phone,
    tone: 'emerald',
    title: 'Phone',
    lines: ['Tech: (415) 680-5881', 'Sales: (513) 593-1883'],
  },
  {
    icon: MapPin,
    tone: 'sky',
    title: 'Office',
    lines: ['United States', 'US-based support team'],
  },
  {
    icon: Clock,
    tone: 'amber',
    title: 'Business hours',
    lines: ['Monday – Friday: 9:00 AM – 6:00 PM EST', 'Enterprise support: 24/7'],
  },
]

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
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
      <MarketingHero
        backdrop="gradient"
        width="narrow"
        eyebrow="Contact"
        title={
          <>
            Contact{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('blue').gradient,
              )}
            >
              us
            </span>
          </>
        }
        description="Get in touch with our team of CPAs and legal professionals."
      />

      <section className="bg-background py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="grid grid-cols-1 gap-10 lg:grid-cols-2"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {/* Form */}
            <motion.div variants={staggerChild}>
              <GlassCard className="bg-surface-raised p-6 sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex size-10 items-center justify-center rounded-xl',
                      accent('blue').chip,
                    )}
                  >
                    <MessageSquare className="size-5" />
                  </span>
                  <h2 className="text-lg font-semibold text-foreground">
                    Send us a message
                  </h2>
                </div>
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
                    className="w-full bg-accent-blue-500 text-white hover:bg-accent-blue-600"
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
              </GlassCard>
            </motion.div>

            {/* Sidebar */}
            <motion.div className="space-y-6" variants={staggerChild}>
              <GlassCard className="p-6 sm:p-8">
                <h2 className="mb-5 text-lg font-semibold text-foreground">
                  Get in touch
                </h2>
                <div className="space-y-5">
                  {CONTACT_METHODS.map((method) => {
                    const Icon = method.icon
                    const a = accent(method.tone)
                    return (
                      <div key={method.title} className="flex items-start gap-4">
                        <span
                          aria-hidden
                          className={cn(
                            'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
                            a.chip,
                          )}
                        >
                          <Icon className="size-5" />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">
                            {method.title}
                          </p>
                          {method.lines.map((line) => (
                            <span
                              key={line}
                              className="block text-sm text-foreground-muted"
                            >
                              {line}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </GlassCard>

              <GlassCard glow className="p-6 sm:p-8">
                <div className="mb-3 flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex size-10 items-center justify-center rounded-xl',
                      accent('blue').chip,
                    )}
                  >
                    <Building2 className="size-5" />
                  </span>
                  <h2 className="text-lg font-semibold text-foreground">
                    Enterprise solutions
                  </h2>
                </div>
                <p className="mb-5 text-sm text-foreground-muted">
                  Need custom integrations, dedicated support, or volume
                  processing? Our enterprise team specializes in large-scale
                  document workflows.
                </p>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-accent-blue-500 text-white hover:bg-accent-blue-600">
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
              </GlassCard>

              <GlassCard className="p-6 sm:p-8">
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  Quick links
                </h2>
                <div className="space-y-2">
                  <a
                    href="/demo"
                    className="block text-sm text-accent-blue-300 underline-offset-4 hover:underline"
                  >
                    View demo videos
                  </a>
                  <a
                    href="/pricing"
                    className="block text-sm text-accent-blue-300 underline-offset-4 hover:underline"
                  >
                    Pricing plans
                  </a>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
