export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN'

export function resolveMessageVariant(gender: Gender, messages: { neutral: string; male?: string; female?: string }): { variant: 'NEUTRAL' | 'MALE' | 'FEMALE'; text: string } {
  if (gender === 'MALE' && messages.male?.trim()) return { variant: 'MALE', text: messages.male }
  if (gender === 'FEMALE' && messages.female?.trim()) return { variant: 'FEMALE', text: messages.female }
  return { variant: 'NEUTRAL', text: messages.neutral }
}
