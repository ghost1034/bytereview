// Date-signed fields are stamped as M/D/YYYY at sealing time (see
// DATE_SIGNED_FORMAT in backend signing_service). The ceremony preview must
// render the identical format so the stamp matches what the signer saw.
export function formatDateSigned(date: Date = new Date(), format = 'MM/DD/YYYY'): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  if (format === 'DD/MM/YYYY') return `${day}/${month}/${date.getFullYear()}`
  if (format === 'YYYY-MM-DD') return `${date.getFullYear()}-${month}-${day}`
  if (format === 'MMM D, YYYY') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${month}/${day}/${date.getFullYear()}`
}
