// Friendly aliases for Chrona schemas defined in the generated OpenAPI types.
// Re-export everything Chrona dashboard modules need from a single import site.
import type { components } from '@/lib/api-types'

type S = components['schemas']

// Devices + pairing codes
export type ChronaDevice = S['ChronaDeviceResponse']
export type ChronaDeviceList = S['ChronaDeviceListResponse']
export type ChronaDeviceUpdateRequest = S['ChronaDeviceUpdateRequest']
export type ChronaPairingCode = S['PairingCodeResponse']
export type ChronaPairingCodeList = S['PairingCodeListResponse']
export type ChronaPairingCodeCreateRequest = S['PairingCodeCreateRequest']

// Dashboard reporting
export type ChronaSummary = S['ChronaSummaryResponse']
export type ChronaSummaryCell = S['ChronaSummaryCell']
export type ChronaSummaryDevice = S['ChronaSummaryDevice']
export type ChronaTimeline = S['ChronaTimelineResponse']
export type ChronaTimelineCard = S['ChronaTimelineCardResponse']
