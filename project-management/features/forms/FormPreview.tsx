'use client'

/** FormPreview — live read-only preview of the form as submitters will see it. */
import { Button } from '@/components/ui/button'
import type { Form } from '../../types'
import { FormFieldRenderer } from './FormFieldRenderer'

type Props = { form: Form }

/** Center-pane live preview of form layout and branding. */
export function FormPreview({ form }: Props) {
  return (
    <div className="overflow-auto rounded-lg border p-4" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--background))' }}>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Live preview
      </p>
      <div className="mx-auto max-w-md">
        {form.branding?.coverImageDataUrl ? (
          <img
            src={form.branding.coverImageDataUrl}
            alt=""
            className="mb-4 h-32 w-full rounded-lg object-cover"
          />
        ) : null}
        <div className="tl-card space-y-4 p-6 shadow-md">
          {form.branding?.logoDataUrl ? (
            <img src={form.branding.logoDataUrl} alt="" className="h-10 w-auto object-contain" />
          ) : null}
          <div>
            <h2 className="font-sans text-xl">{form.name || 'Untitled form'}</h2>
            {form.description ? (
              <p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
                {form.description}
              </p>
            ) : null}
          </div>
          {form.fields.map((field) => (
            <FormFieldRenderer
              key={field.id}
              field={field}
              value={undefined}
              onChange={() => {}}
              readOnly
            />
          ))}
          {form.fields.some((f) => f.required) ? (
            <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              * Required fields
            </p>
          ) : null}
          <Button type="button" className="tl-btn-primary w-full border-0" disabled>
            Submit
          </Button>
        </div>
      </div>
    </div>
  )
}
