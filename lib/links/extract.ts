export function extractFirstHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>()]+/iu)
  return match ? match[0].replace(/[.,!?;:]+$/u, '') : null
}
