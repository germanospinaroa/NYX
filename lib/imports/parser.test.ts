import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseContactFile } from './parser'

describe('contact file parser', () => {
  it('parses CSV with headers and rows', async () => {
    const file = new File(['Nombre,Telefono\nAna,3001234567\n'], 'agenda.csv', { type: 'text/csv' })
    await expect(parseContactFile(file)).resolves.toEqual({
      format: 'CSV',
      headers: ['Nombre', 'Telefono'],
      rows: [{ Nombre: 'Ana', Telefono: '3001234567' }],
    })
  })

  it('parses XLSX with headers and rows', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Contacts')
    worksheet.addRow(['Full Name', 'Mobile'])
    worksheet.addRow(['Unicode Ánonimo', '+1 202 555 0100'])
    const bytes = await workbook.xlsx.writeBuffer()
    const file = new File([bytes], 'agenda.xlsx')
    await expect(parseContactFile(file)).resolves.toMatchObject({
      format: 'XLSX',
      headers: ['Full Name', 'Mobile'],
      rows: [{ 'Full Name': 'Unicode Ánonimo', Mobile: '+1 202 555 0100' }],
    })
  })

  it('rejects unsupported extensions and empty files', async () => {
    await expect(parseContactFile(new File(['x'], 'agenda.txt'))).rejects.toThrow('UNSUPPORTED_FORMAT')
    await expect(parseContactFile(new File([''], 'agenda.csv'))).rejects.toThrow('EMPTY_FILE')
  })

  it('rejects duplicate headers instead of silently overwriting columns', async () => {
    const file = new File(['Name,Name\nAna,3001234567\n'], 'agenda.csv')
    await expect(parseContactFile(file)).rejects.toThrow('INVALID_HEADERS')
  })
})
