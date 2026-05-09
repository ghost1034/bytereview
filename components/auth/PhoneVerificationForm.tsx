'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { multiFactor, PhoneAuthProvider, PhoneMultiFactorGenerator, RecaptchaVerifier } from 'firebase/auth'
import { Loader2, MailCheck } from 'lucide-react'

import PhoneNumberInput from '@/components/auth/PhoneNumberInput'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiClient, ApiError } from '@/lib/api'
import { auth, hasEnrolledPhoneMfa } from '@/lib/firebase'
import {
  createDefaultPhoneNumberInputValue,
  getDisplayPhoneNumber,
  getE164PhoneNumber,
  parsePhoneNumberInputValue,
} from '@/lib/phone-number'

interface PhoneVerificationFormProps {
  mode?: 'enroll' | 'signin'
  initialPhoneNumber?: string
  redirectTo?: string
  autoSendOnMount?: boolean
  onVerified?: () => void
}

function createPhoneAlreadyInUseError(): Error & { code: string } {
  const error = new Error('That phone number is already linked to another account') as Error & { code: string }
  error.code = 'app/phone-number-already-in-use'
  return error
}

function getPhoneVerificationErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
}

function getPhoneVerificationErrorMessage(error: unknown): string {
  const code = getPhoneVerificationErrorCode(error)

  switch (code) {
    case 'auth/unverified-email':
      return 'Verify your email before enabling SMS sign-in codes.'
    case 'auth/invalid-phone-number':
      return 'Enter a valid phone number for the selected country.'
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA verification failed. Please try again.'
    case 'auth/code-expired':
      return 'That verification code expired. Send a new code and try again.'
    case 'auth/invalid-verification-code':
      return 'That verification code is not valid. Double-check the SMS and try again.'
    case 'auth/invalid-multi-factor-session':
    case 'auth/missing-multi-factor-session':
      return 'This verification step expired. Please sign in again.'
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in before changing your sign-in code settings.'
    case 'auth/unsupported-first-factor':
      return 'This account was signed in with a method that cannot enable SMS sign-in codes. Sign out and sign back in with Google or email and password, then try again.'
    case 'auth/second-factor-already-in-use':
    case 'app/phone-number-already-in-use':
      return 'That phone number is already being used for sign-in codes on another account.'
    case 'auth/too-many-requests':
      return 'Too many verification attempts were made. Please wait a bit and try again.'
    default:
      return error instanceof Error ? error.message : 'Phone verification failed. Please try again.'
  }
}

function shouldResetRecaptchaVerifier(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : ''

  return (
    code === 'auth/captcha-check-failed'
    || code === 'auth/invalid-app-credential'
    || code === 'auth/missing-app-credential'
    || /reCAPTCHA has already been rendered in this element/i.test(message)
  )
}

export default function PhoneVerificationForm({
  mode = 'enroll',
  initialPhoneNumber = '',
  redirectTo,
  autoSendOnMount = false,
  onVerified,
}: PhoneVerificationFormProps) {
  const {
    completeMfaEnrollment,
    completeMfaSignIn,
    pendingMfaPhoneNumber,
    refreshCurrentUser,
    sendCurrentUserEmailVerification,
    sendMfaChallengeCode,
    signOut,
  } = useAuth()
  const { toast } = useToast()

  const [phoneValue, setPhoneValue] = useState(() =>
    initialPhoneNumber ? parsePhoneNumberInputValue(initialPhoneNumber) : createDefaultPhoneNumberInputValue(),
  )
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [isRefreshingUser, setIsRefreshingUser] = useState(false)
  const [isSendingEmailVerification, setIsSendingEmailVerification] = useState(false)
  const [recaptchaContainerKey, setRecaptchaContainerKey] = useState(0)

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null)
  const hasAutoSentRef = useRef(false)
  const currentUser = auth.currentUser
  const needsEmailVerification = mode === 'enroll' && !!currentUser && !currentUser.emailVerified

  useEffect(() => {
    setPhoneValue(
      initialPhoneNumber ? parsePhoneNumberInputValue(initialPhoneNumber) : createDefaultPhoneNumberInputValue(),
    )
  }, [initialPhoneNumber])

  const disposeRecaptchaVerifier = useCallback(() => {
    recaptchaVerifierRef.current?.clear()
    recaptchaVerifierRef.current = null
  }, [])

  const resetRecaptchaVerifier = useCallback(() => {
    disposeRecaptchaVerifier()
    setRecaptchaContainerKey((currentKey) => currentKey + 1)
  }, [disposeRecaptchaVerifier])

  const ensureRecaptchaVerifier = useCallback(async () => {
    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current
    }

    const container = recaptchaContainerRef.current
    if (!container) {
      throw new Error('Phone verification is still loading. Please try again in a moment.')
    }

    const verifier = new RecaptchaVerifier(auth, container, {
      size: 'invisible',
    })

    recaptchaVerifierRef.current = verifier

    try {
      await verifier.render()
      return verifier
    } catch (renderError) {
      verifier.clear()
      if (recaptchaVerifierRef.current === verifier) {
        recaptchaVerifierRef.current = null
      }
      setRecaptchaContainerKey((currentKey) => currentKey + 1)
      console.error('Failed to render reCAPTCHA verifier', renderError)
      throw new Error('Phone verification is still loading. Please try again in a moment.')
    }
  }, [])

  useEffect(() => {
    return () => {
      disposeRecaptchaVerifier()
    }
  }, [disposeRecaptchaVerifier])

  const sendEnrollmentCodeToPhone = useCallback(async (normalizedPhoneNumber: string) => {
    const enrollmentUser = auth.currentUser
    if (!enrollmentUser) {
      throw new Error('Please sign in again before setting up sign-in codes.')
    }

    if (!enrollmentUser.emailVerified) {
      throw new Error('Verify your email before enabling SMS sign-in codes.')
    }

    if (hasEnrolledPhoneMfa(enrollmentUser)) {
      if (onVerified) {
        onVerified()
      }
      await completeMfaEnrollment(redirectTo)
      return normalizedPhoneNumber
    }

    const availability = await apiClient.checkPhoneNumberAvailability(normalizedPhoneNumber)
    if (!availability.available) {
      throw createPhoneAlreadyInUseError()
    }

    const verifier = await ensureRecaptchaVerifier()

    const multiFactorSession = await multiFactor(enrollmentUser).getSession()
    const nextVerificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber({
      phoneNumber: normalizedPhoneNumber,
      session: multiFactorSession,
    }, verifier)

    setPhoneValue(parsePhoneNumberInputValue(normalizedPhoneNumber))
    setVerificationId(nextVerificationId)
    setVerificationCode('')
    return normalizedPhoneNumber
  }, [completeMfaEnrollment, ensureRecaptchaVerifier, onVerified, redirectTo])

  const sendVerificationCode = useCallback(async () => {
    if (mode === 'signin') {
      const verifier = await ensureRecaptchaVerifier()

      const nextVerificationId = await sendMfaChallengeCode(verifier)
      setVerificationId(nextVerificationId)
      setVerificationCode('')
      return pendingMfaPhoneNumber || 'your enrolled phone number'
    }

    const normalizedPhoneNumber = getE164PhoneNumber(phoneValue)
    if (!normalizedPhoneNumber) {
      throw new Error('Enter a valid phone number for the selected country.')
    }

    return sendEnrollmentCodeToPhone(normalizedPhoneNumber)
  }, [ensureRecaptchaVerifier, mode, pendingMfaPhoneNumber, phoneValue, sendEnrollmentCodeToPhone, sendMfaChallengeCode])

  useEffect(() => {
    if (!autoSendOnMount || hasAutoSentRef.current || needsEmailVerification) {
      return
    }

    if (mode === 'enroll') {
      const initialPhoneValue = parsePhoneNumberInputValue(initialPhoneNumber)
      const normalizedPhoneNumber = getE164PhoneNumber(initialPhoneValue)
      if (!normalizedPhoneNumber) {
        return
      }

      hasAutoSentRef.current = true
      setPhoneValue(initialPhoneValue)
    } else if (!pendingMfaPhoneNumber) {
      return
    } else {
      hasAutoSentRef.current = true
    }

    setIsSendingCode(true)
    setError('')
    setErrorCode('')

    void sendVerificationCode()
      .then((destinationPhoneNumber) => {
        toast({
          title: 'Verification code sent',
          description: `We sent a 6-digit code to ${destinationPhoneNumber}.`,
        })
      })
      .catch((sendError) => {
        setErrorCode(getPhoneVerificationErrorCode(sendError))
        setError(getPhoneVerificationErrorMessage(sendError))
        if (shouldResetRecaptchaVerifier(sendError)) {
          resetRecaptchaVerifier()
        }
        hasAutoSentRef.current = false
      })
      .finally(() => {
        setIsSendingCode(false)
      })
  }, [autoSendOnMount, initialPhoneNumber, mode, needsEmailVerification, pendingMfaPhoneNumber, resetRecaptchaVerifier, sendVerificationCode, toast])

  const handleSendCode = async (event: FormEvent) => {
    event.preventDefault()
    setIsSendingCode(true)
    setError('')
    setErrorCode('')

    try {
      const destinationPhoneNumber = await sendVerificationCode()
      toast({
        title: verificationId ? 'New verification code sent' : 'Verification code sent',
        description: `We sent a 6-digit code to ${destinationPhoneNumber}.`,
      })
    } catch (sendError) {
      if (sendError instanceof ApiError && sendError.status === 400) {
        setErrorCode(getPhoneVerificationErrorCode(sendError))
        setError(sendError.message)
        return
      }
      setErrorCode(getPhoneVerificationErrorCode(sendError))
      setError(getPhoneVerificationErrorMessage(sendError))
      if (shouldResetRecaptchaVerifier(sendError)) {
        resetRecaptchaVerifier()
      }
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerifyCode = async (event: FormEvent) => {
    event.preventDefault()

    if (!verificationId) {
      setError('Send a verification code before entering the SMS code.')
      return
    }

    if (verificationCode.length !== 6) {
      setError('Enter the full 6-digit verification code.')
      return
    }

    setIsVerifyingCode(true)
    setError('')
    setErrorCode('')

    try {
      const credential = PhoneAuthProvider.credential(verificationId, verificationCode)
      const assertion = PhoneMultiFactorGenerator.assertion(credential)

      if (mode === 'signin') {
        await completeMfaSignIn(assertion, redirectTo)
        toast({
          title: 'Signed in',
          description: 'Verification complete. Welcome back.',
        })
      } else {
        const enrollmentUser = auth.currentUser
        if (!enrollmentUser) {
          throw new Error('Please sign in again before setting up sign-in codes.')
        }

        await multiFactor(enrollmentUser).enroll(assertion, enrollmentUser.displayName || undefined)

        if (onVerified) {
          onVerified()
        }

        await completeMfaEnrollment(redirectTo)
        toast({
          title: 'Sign-in codes enabled',
          description: 'You will now enter a verification code each time you sign in.',
        })
      }
    } catch (verificationError) {
      setErrorCode(getPhoneVerificationErrorCode(verificationError))
      setError(getPhoneVerificationErrorMessage(verificationError))
    } finally {
      setIsVerifyingCode(false)
    }
  }

  const handleRefreshUser = async () => {
    setIsRefreshingUser(true)
    setError('')
    setErrorCode('')

    try {
      const refreshedUser = await refreshCurrentUser()
      if (!refreshedUser?.emailVerified) {
        setError('Your email is still not verified yet. Open the email we sent, then try again.')
        return
      }

      toast({
        title: 'Email verified',
        description: 'You can now enable your SMS sign-in code.',
      })
    } catch (refreshError) {
      setErrorCode(getPhoneVerificationErrorCode(refreshError))
      setError(getPhoneVerificationErrorMessage(refreshError))
    } finally {
      setIsRefreshingUser(false)
    }
  }

  const handleSendEmailVerification = async () => {
    setIsSendingEmailVerification(true)
    setError('')
    setErrorCode('')

    try {
      await sendCurrentUserEmailVerification()
      toast({
        title: 'Verification email sent',
        description: 'Open the email we sent you, then come back here to continue.',
      })
    } catch (sendError) {
      setErrorCode(getPhoneVerificationErrorCode(sendError))
      setError(getPhoneVerificationErrorMessage(sendError))
    } finally {
      setIsSendingEmailVerification(false)
    }
  }

  const displayedPhoneNumber = mode === 'signin'
    ? pendingMfaPhoneNumber || 'your enrolled phone number'
    : getDisplayPhoneNumber(phoneValue)

  return (
    <div className="space-y-5">
      {needsEmailVerification && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-3">
              <p>
                Verify your email address before enabling SMS sign-in codes for {currentUser?.email || 'your account'}.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendEmailVerification}
                  disabled={isSendingEmailVerification || isRefreshingUser}
                >
                  {isSendingEmailVerification ? 'Sending Email...' : 'Resend Verification Email'}
                </Button>
                <Button
                  type="button"
                  onClick={handleRefreshUser}
                  disabled={isSendingEmailVerification || isRefreshingUser}
                >
                  {isRefreshingUser ? 'Checking...' : 'I Have Verified My Email'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSendCode} className="space-y-4">
        {mode === 'enroll' ? (
          <div className="space-y-2">
            <Label htmlFor="signup-phone">Phone Number</Label>
            <PhoneNumberInput
              id="signup-phone"
              value={phoneValue}
              onChange={setPhoneValue}
              disabled={needsEmailVerification || isSendingCode || isVerifyingCode}
              required
            />
            <p className="text-xs text-gray-500">
              This phone will receive a one-time SMS code every time you sign in.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
            We will send a 6-digit sign-in code to {displayedPhoneNumber}.
          </div>
        )}

        <Button
          type="submit"
          disabled={needsEmailVerification || isSendingCode || isVerifyingCode}
          className="w-full"
        >
          {isSendingCode ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending Code...
            </span>
          ) : verificationId ? 'Resend Code' : mode === 'signin' ? 'Send Sign-In Code' : 'Send Verification Code'}
        </Button>
      </form>

      {verificationId && (
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

          <Button type="submit" disabled={isSendingCode || isVerifyingCode} className="w-full">
            {isVerifyingCode ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </span>
            ) : mode === 'signin' ? 'Verify and Continue' : 'Enable Sign-In Codes'}
          </Button>
        </form>
      )}

      {error && (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <p>{error}</p>
          {errorCode === 'auth/unsupported-first-factor' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void signOut()
              }}
              className="border-red-200 bg-white text-red-700 hover:bg-red-100 hover:text-red-800"
            >
              Sign Out
            </Button>
          )}
        </div>
      )}

      <div key={recaptchaContainerKey} ref={recaptchaContainerRef} />
    </div>
  )
}
