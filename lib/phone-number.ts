import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'

export type PhoneCountryCode = CountryCode

export interface PhoneCountryOption {
  country: PhoneCountryCode
  callingCode: string
  name: string
  compactLabel: string
}

export interface PhoneNumberInputValue {
  country: PhoneCountryCode
  nationalNumber: string
}

export const DEFAULT_PHONE_COUNTRY: PhoneCountryCode = 'US'

const regionNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

function getCountryName(country: PhoneCountryCode): string {
  return regionNames?.of(country) ?? country
}

function sortCountries(a: PhoneCountryOption, b: PhoneCountryOption): number {
  if (a.country === DEFAULT_PHONE_COUNTRY) {
    return -1
  }

  if (b.country === DEFAULT_PHONE_COUNTRY) {
    return 1
  }

  return a.name.localeCompare(b.name)
}

export const PHONE_COUNTRY_OPTIONS: PhoneCountryOption[] = getCountries()
  .map((country) => ({
    country,
    callingCode: getCountryCallingCode(country),
    name: getCountryName(country),
    compactLabel: `${country} +${getCountryCallingCode(country)}`,
  }))
  .sort(sortCountries)

export function createDefaultPhoneNumberInputValue(): PhoneNumberInputValue {
  return {
    country: DEFAULT_PHONE_COUNTRY,
    nationalNumber: '',
  }
}

export function formatNationalPhoneNumber(value: string, country: PhoneCountryCode): string {
  const formatter = new AsYouType(country)
  return formatter.input(value)
}

export function parsePhoneNumberInputValue(phoneNumber?: string | null): PhoneNumberInputValue {
  if (!phoneNumber) {
    return createDefaultPhoneNumberInputValue()
  }

  const trimmedPhoneNumber = phoneNumber.trim()
  if (!trimmedPhoneNumber) {
    return createDefaultPhoneNumberInputValue()
  }

  const parsedPhoneNumber = parsePhoneNumberFromString(trimmedPhoneNumber)
  if (!parsedPhoneNumber) {
    return {
      country: DEFAULT_PHONE_COUNTRY,
      nationalNumber: formatNationalPhoneNumber(trimmedPhoneNumber, DEFAULT_PHONE_COUNTRY),
    }
  }

  const country = parsedPhoneNumber.country ?? DEFAULT_PHONE_COUNTRY

  return {
    country,
    nationalNumber: formatNationalPhoneNumber(parsedPhoneNumber.nationalNumber, country),
  }
}

export function coercePhoneNumberInput(
  rawValue: string,
  currentCountry: PhoneCountryCode,
): PhoneNumberInputValue {
  const trimmedValue = rawValue.trim()

  if (!trimmedValue) {
    return {
      country: currentCountry,
      nationalNumber: '',
    }
  }

  if (trimmedValue.startsWith('+')) {
    const parsedPhoneNumber = parsePhoneNumberFromString(trimmedValue)
    if (parsedPhoneNumber) {
      const country = parsedPhoneNumber.country ?? currentCountry

      return {
        country,
        nationalNumber: formatNationalPhoneNumber(parsedPhoneNumber.nationalNumber, country),
      }
    }
  }

  return {
    country: currentCountry,
    nationalNumber: formatNationalPhoneNumber(trimmedValue, currentCountry),
  }
}

export function changePhoneCountry(
  value: PhoneNumberInputValue,
  country: PhoneCountryCode,
): PhoneNumberInputValue {
  return {
    country,
    nationalNumber: formatNationalPhoneNumber(value.nationalNumber, country),
  }
}

export function getE164PhoneNumber(value: PhoneNumberInputValue): string | null {
  const parsedPhoneNumber = parsePhoneNumberFromString(value.nationalNumber, value.country)

  if (!parsedPhoneNumber || !parsedPhoneNumber.isValid()) {
    return null
  }

  return parsedPhoneNumber.number
}

export function getDisplayPhoneNumber(value: PhoneNumberInputValue): string {
  return getE164PhoneNumber(value) ?? `+${getCountryCallingCode(value.country)} ${value.nationalNumber}`.trim()
}
