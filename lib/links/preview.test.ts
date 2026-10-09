import { describe, expect, it } from 'vitest'
import { extractFirstHttpUrl } from './extract'
import { isPublicIp, parseLinkMetadata } from './preview'

describe('link preview safety and presentation', () => {
  it('extracts only the first URL and preserves text separately', () => { expect(extractFirstHttpUrl('Hola https://example.com/a. y https://second.test')).toBe('https://example.com/a') })
  it('rejects private and special addresses', () => { expect(isPublicIp('127.0.0.1')).toBe(false); expect(isPublicIp('10.0.0.2')).toBe(false); expect(isPublicIp('169.254.1.1')).toBe(false); expect(isPublicIp('::1')).toBe(false); expect(isPublicIp('93.184.216.34')).toBe(true) })
  it('uses OG metadata with fallbacks', () => { const data = parseLinkMetadata('<meta property="og:title" content="Title"><meta property="og:description" content="Desc"><meta property="og:image" content="https://example.com/image.jpg">', new URL('https://example.com')); expect(data.title).toBe('Title'); expect(data.description).toBe('Desc'); expect(data.imageUrl).toContain('image.jpg') })
})
