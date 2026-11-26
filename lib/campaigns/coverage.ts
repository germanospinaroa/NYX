export type GenderCoverage = { MALE: number; FEMALE: number; UNKNOWN: number }
export type CoverageStep = { type: 'TEXT' | 'IMAGE' | 'AUDIO'; neutralText?: string; maleText?: string; femaleText?: string; mediaPath?: string }
export type CoverageVariant = { key: string; steps: CoverageStep[] }
export type CoverageIssue = { variantKey: string; stepIndex: number; field: 'neutralText' | 'maleText' | 'femaleText'; gender: 'MALE' | 'FEMALE' | 'UNKNOWN' }

const text = (value?: string) => value?.trim() ?? ''

export function findCoverageIssues(variants: CoverageVariant[], counts: GenderCoverage): CoverageIssue[] {
  const issues: CoverageIssue[] = []
  for (const variant of variants) {
    variant.steps.forEach((step, stepIndex) => {
      if (step.type !== 'TEXT') return
      const neutral = text(step.neutralText)
      const genders: Array<['MALE' | 'FEMALE' | 'UNKNOWN', number, string, 'neutralText' | 'maleText' | 'femaleText']> = [
        ['MALE', counts.MALE, text(step.maleText), 'maleText'],
        ['FEMALE', counts.FEMALE, text(step.femaleText), 'femaleText'],
        ['UNKNOWN', counts.UNKNOWN, '', 'neutralText'],
      ]
      for (const [gender, amount, specific, field] of genders) {
        if (amount > 0 && !specific && !neutral) issues.push({ variantKey: variant.key, stepIndex, field, gender })
      }
    })
  }
  return issues
}
