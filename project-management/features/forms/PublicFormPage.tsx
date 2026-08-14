'use client'

/**
 * PublicFormPage — unauthenticated form submission with branding and all field types.
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFormsStore } from '../../stores/entities'
import { useAuthStore } from '../../stores/auth'
import { submitForm } from '../../lib/forms/submitForm'
import { isFormFieldVisible, validateFormAnswers } from '../../lib/forms/answerFormat'
import {
  fetchAuthenticatedForm,
  fetchPublicForm,
  submitAuthenticatedFormApi,
  type PublicFormDefinition,
  submitPublicFormApi,
  usesTasklyticBackend,
} from '../../lib/forms/publicFormApi'
import type { Form } from '../../types'
import { FormFieldRenderer, type FormAnswers } from './FormFieldRenderer'

type Props = { formId: string }

/** Public-facing form page rendered without auth shell. */
export function PublicFormPage({ formId }: Props) {
  const storeForm = useFormsStore((s) => s.getById(formId))
  const [remoteForm, setRemoteForm] = useState<PublicFormDefinition | null | undefined>(undefined)
  const [authenticatedFlow, setAuthenticatedFlow] = useState(false)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [answers, setAnswers] = useState<FormAnswers>({})
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!usesTasklyticBackend()) {
      setRemoteForm(null)
      return
    }
    let cancelled = false
    void fetchAuthenticatedForm(formId)
      .then(async (authenticatedForm) => ({
        form: authenticatedForm ?? await fetchPublicForm(formId),
        authenticated: Boolean(authenticatedForm),
      }))
      .then(({ form, authenticated }) => {
        if (!cancelled) {
          setRemoteForm(form)
          setAuthenticatedFlow(authenticated)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRemoteForm(null)
          setError(err instanceof Error ? err.message : 'Failed to load form')
        }
      })
    return () => { cancelled = true }
  }, [formId])

  const form = usesTasklyticBackend() ? remoteForm ?? null : storeForm ?? null
  const formLoading = usesTasklyticBackend() && remoteForm === undefined

  if (formLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-foreground-muted">Loading form…</p>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-foreground-muted">{error ?? 'Form not found.'}</p>
      </div>
    )
  }

  if (!form.isPublic) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-foreground-muted">This form is not published.</p>
      </div>
    )
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const validationError = validateFormAnswers(form, answers)
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    try {
      if (usesTasklyticBackend()) {
        if (authenticatedFlow) await submitAuthenticatedFormApi(formId, answers)
        else await submitPublicFormApi(formId, answers, remoteForm?.submissionToken)
        setSubmitted(true)
        return
      }
      const result = await submitForm(formId, answers, currentUserId ?? undefined)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="tasklytic-public-card max-w-md p-8 text-center">
          <p className="tasklytic-public-heading text-xl">{form.confirmationMessage}</p>
          <Button
            className="tasklytic-public-primary mt-6"
            onClick={() => {
              setSubmitted(false)
              setAnswers({})
            }}
          >
            Submit another response
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-lg">
        <PublicFormBody
          form={form}
          answers={answers}
          setAnswers={setAnswers}
          error={error}
          loading={loading}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}

function PublicFormBody({
  form,
  answers,
  setAnswers,
  error,
  loading,
  onSubmit,
}: {
  form: PublicFormDefinition | Form
  answers: FormAnswers
  setAnswers: React.Dispatch<React.SetStateAction<FormAnswers>>
  error: string | null
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <>
      {form.branding?.coverImageDataUrl ? (
        <img src={form.branding.coverImageDataUrl} alt="" className="mb-6 h-40 w-full rounded-lg object-cover" />
      ) : null}
      <form onSubmit={onSubmit} className="tasklytic-public-card space-y-4 p-6">
        {form.branding?.logoDataUrl ? (
          <img src={form.branding.logoDataUrl} alt="" className="h-10 w-auto object-contain" />
        ) : null}
        <div>
          <h1 className="tasklytic-public-heading text-2xl">{form.name}</h1>
          {form.description ? (
            <p className="mt-2 text-sm text-foreground-muted">{form.description}</p>
          ) : null}
        </div>
        {form.fields.filter((field) => isFormFieldVisible(field, answers)).map((field) => (
          <FormFieldRenderer
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [field.id]: v }))}
            directUploads={usesTasklyticBackend()}
          />
        ))}
        {form.fields.some((f) => f.required) ? (
          <p className="text-xs text-foreground-muted">* Required fields</p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        <Button type="submit" className="tasklytic-public-primary w-full" disabled={loading}>
          {loading ? 'Submitting…' : 'Submit'}
        </Button>
      </form>
    </>
  )
}
