import { parsePhoneNumber } from 'libphonenumber-js/min'

export type PhoneNormalization =
  | { e164: string; country?: string }
  | { errorCode: 'INVALID_PHONE' }

export function normalizePhone(rawValue: string, defaultRegion: string): PhoneNormalization {
  const raw = rawValue.trim()
  if (!raw) return { errorCode: 'INVALID_PHONE' }

  const candidate = raw.replace(/^00(?=\d)/, '+')
  try {
    const phone = parsePhoneNumber(candidate, defaultRegion as never)
    if (!phone || !phone.isValid()) return { errorCode: 'INVALID_PHONE' }
    return { e164: phone.number, country: phone.country }
  } catch {
    return { errorCode: 'INVALID_PHONE' }
  }
}
