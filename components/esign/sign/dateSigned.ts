// Date-signed fields are stamped as M/D/YYYY at sealing time (see
// DATE_SIGNED_FORMAT in backend signing_service). The ceremony preview must
// render the identical format so the stamp matches what the signer saw.
export function formatDateSigned(date: Date = new Date()): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
}
