export type CampaignVariableToken = '{{nombre}}' | '{{nombre_completo}}'

export function insertTemplateVariable(currentValue: string, selectionStart: number, selectionEnd: number, variable: CampaignVariableToken) {
  const start = Math.max(0, Math.min(selectionStart, currentValue.length))
  const end = Math.max(start, Math.min(selectionEnd, currentValue.length))
  return { value: `${currentValue.slice(0, start)}${variable}${currentValue.slice(end)}`, cursor: start + variable.length }
}
