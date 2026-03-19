'use client'

import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { linkWithPhoneNumber, RecaptchaVerifier, type ConfirmationResult } from 'firebase/auth'
import { Loader2 } from 'lucide-react'

import PhoneNumberInput from '@/components/auth/PhoneNumberInput'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { auth, hasVerifiedPhone } from '@/lib/firebase'
import {
  createDefaultPhoneNumberInputValue,
  getDisplayPhoneNumber,
  getE164PhoneNumber,
  parsePhoneNumberInputValue,
} from '@/lib/phone-number'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

interface PhoneVerificationFormProps {
  initialPhoneNumber?: string
  redirectTo?: string
  autoSendOnMount?: boolean
  onVerified?: () => void
}

function getPhoneVerificationErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''

  switch (code) {
    case 'auth/invalid-phone-number':
      return 'Enter a valid phone number for the selected country.'
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA verification failed. Please try again.'
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'That phone number is already linked to another CPAAutomation account.'
    case 'auth/code-expired':
      return 'That verification code expired. Send a new code and try again.'
    case 'auth/invalid-verification-code':
      return 'That verification code is not valid. Double-check the SMS and try again.'
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in before verifying your phone number.'
    case 'auth/too-many-requests':
      return 'Too many verification attempts were made. Please wait a bit and try again.'
    default:
      return error instanceof Error ? error.message : 'Phone verification failed. Please try again.'
  }
}

export default function PhoneVerificationForm({
  initialPhoneNumber = '',
  redirectTo,
  autoSendOnMount = false,
  onVerified,
}: PhoneVerificationFormProps) {
  const { completePhoneVerification } = useAuth()
  const { toast } = useToast()

  const [phoneValue, setPhoneValue] = useState(() =>
    initialPhoneNumber ? parsePhoneNumberInputValue(initialPhoneNumber) : createDefaultPhoneNumberInputValue(),
  )
  const [verificationCode, setVerificationCode] = useState('')
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [error, setError] = useState('')
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)
  const hasAutoSentRef = useRef(false)
  const recaptchaElementId = useId().replace(/:/g, '-')

  useEffect(() => {
    setPhoneValue(
      initialPhoneNumber ? parsePhoneNumberInputValue(initialPhoneNumber) : createDefaultPhoneNumberInputValue(),
    )
  }, [initialPhoneNumber])

  useEffect(() => {
    const verifier = new RecaptchaVerifier(auth, recaptchaElementId, {
      size: 'invisible',
    })

    recaptchaVerifierRef.current = verifier

    void verifier.render().catch((renderError) => {
      console.error('Failed to render reCAPTCHA verifier', renderError)
    })

    return () => {
      verifier.clear()
      recaptchaVerifierRef.current = null
    }
  }, [recaptchaElementId])

  const sendVerificationCodeToPhone = useCallback(async (normalizedPhoneNumber: string) => {
    const currentUser = auth.currentUser
    if (!currentUser) {
      throw new Error('Please sign in again before verifying your phone number.')
    }

    if (hasVerifiedPhone(currentUser)) {
      if (onVerified) {
        onVerified()
      }
      await completePhoneVerification(redirectTo)
      return normalizedPhoneNumber
    }

    const verifier = recaptchaVerifierRef.current
    if (!verifier) {
      throw new Error('Phone verification is still loading. Please try again in a moment.')
    }

    const result = await linkWithPhoneNumber(currentUser, normalizedPhoneNumber, verifier)
    setPhoneValue(parsePhoneNumberInputValue(normalizedPhoneNumber))
    setConfirmationResult(result)
    setVerificationCode('')
    return normalizedPhoneNumber
  }, [completePhoneVerification, onVerified, redirectTo])

  const sendVerificationCode = useCallback(async () => {
    const normalizedPhoneNumber = getE164PhoneNumber(phoneValue)
    if (!normalizedPhoneNumber) {
      throw new Error('Enter a valid phone number for the selected country.')
    }

    return sendVerificationCodeToPhone(normalizedPhoneNumber)
  }, [phoneValue, sendVerificationCodeToPhone])

  useEffect(() => {
    if (!autoSendOnMount || hasAutoSentRef.current || !initialPhoneNumber) {
      return
    }

    const initialPhoneValue = parsePhoneNumberInputValue(initialPhoneNumber)
    const normalizedPhoneNumber = getE164PhoneNumber(initialPhoneValue)
    if (!normalizedPhoneNumber) {
      return
    }

    hasAutoSentRef.current = true
    setPhoneValue(initialPhoneValue)
    setIsSendingCode(true)
    setError('')

    void sendVerificationCodeToPhone(normalizedPhoneNumber)
      .then((verifiedPhoneNumber) => {
        toast({
          title: 'Verification code sent',
          description: `We sent a 6-digit code to ${verifiedPhoneNumber}.`,
        })
      })
      .catch((sendError) => {
        setError(getPhoneVerificationErrorMessage(sendError))
      })
      .finally(() => {
        setIsSendingCode(false)
      })
  }, [autoSendOnMount, initialPhoneNumber, sendVerificationCodeToPhone, toast])

  const handleSendCode = async (event: FormEvent) => {
    event.preventDefault()
    setIsSendingCode(true)
    setError('')

    try {
      const normalizedPhoneNumber = await sendVerificationCode()
      toast({
        title: confirmationResult ? 'New verification code sent' : 'Verification code sent',
        description: `We sent a 6-digit code to ${normalizedPhoneNumber}.`,
      })
    } catch (sendError) {
      setError(getPhoneVerificationErrorMessage(sendError))
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerifyCode = async (event: FormEvent) => {
    event.preventDefault()

    if (!confirmationResult) {
      setError('Send a verification code before entering the SMS code.')
      return
    }

    if (verificationCode.length !== 6) {
      setError('Enter the full 6-digit verification code.')
      return
    }

    setIsVerifyingCode(true)
    setError('')

    try {
      await confirmationResult.confirm(verificationCode)

      if (onVerified) {
        onVerified()
      }

      await completePhoneVerification(redirectTo)
      toast({
        title: 'Phone verified',
        description: 'Your account is ready to use.',
      })
    } catch (verificationError) {
      setError(getPhoneVerificationErrorMessage(verificationError))
    } finally {
      setIsVerifyingCode(false)
    }
  }

  const displayedPhoneNumber = getDisplayPhoneNumber(phoneValue)

  return (
    <div className="space-y-5">
      <form onSubmit={handleSendCode} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-phone">Phone Number</Label>
          <PhoneNumberInput
            id="signup-phone"
            value={phoneValue}
            onChange={setPhoneValue}
            disabled={isSendingCode || isVerifyingCode}
            required
          />
          <p className="text-xs text-gray-500">
            Choose a country code, then we will send a one-time SMS to verify this number.
          </p>
        </div>

        <Button type="submit" disabled={isSendingCode || isVerifyingCode} className="w-full lido-blue hover:lido-blue-dark text-white">
          {isSendingCode ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending Code...
            </span>
          ) : confirmationResult ? 'Resend Code' : 'Send Verification Code'}
        </Button>
      </form>

      {confirmationResult && (
        <form onSubmit={handleVerifyCode} className="space-y-4 border-t border-gray-200 pt-5">
          <div className="space-y-2">
            <Label htmlFor="verification-code">Verification Code</Label>
            <InputOTP
              id="verification-code"
              maxLength={6}
              value={verificationCode}
              onChange={setVerificationCode}
              containerClassName="justify-center"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <p className="text-xs text-gray-500">
              Enter the 6-digit code sent to {displayedPhoneNumber}.
            </p>
          </div>

          <Button type="submit" disabled={isSendingCode || isVerifyingCode} className="w-full lido-blue hover:lido-blue-dark text-white">
            {isVerifyingCode ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </span>
            ) : 'Verify Phone Number'}
          </Button>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div id={recaptchaElementId} />
    </div>
  )
}
