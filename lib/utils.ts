import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

const naturalTextCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function compareNaturalText(a?: string | null, b?: string | null) {
  return naturalTextCollator.compare((a || '').trim(), (b || '').trim())
}
