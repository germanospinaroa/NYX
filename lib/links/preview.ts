import dns from 'node:dns/promises'
import net from 'node:net'
export { extractFirstHttpUrl } from './extract'

export type LinkMetadata = { url: string; hostname: string; title: string | null; description: string | null; imageUrl: string | null }
const MAX_HTML_BYTES = 1_000_000
const MAX_TITLE = 240
const MAX_DESCRIPTION = 500

function ipv4Private(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31
}

function ipv6Private(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/gu, '')
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)
  return Boolean(mapped && ipv4Private(mapped[1]))
}

export function isPublicIp(ip: string): boolean { return net.isIP(ip) === 4 ? !ipv4Private(ip) : net.isIP(ip) === 6 ? !ipv6Private(ip) : false }

export async function assertSafeRemoteUrl(raw: string): Promise<URL> {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('UNSAFE_URL')
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('UNSAFE_URL')
  const hostname = url.hostname.replace(/^\[|\]$/gu, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || net.isIP(hostname) && !isPublicIp(hostname)) throw new Error('UNSAFE_URL')
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) throw new Error('UNSAFE_URL')
  return url
}

function meta(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'iu'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'iu'))
  return match?.[1]?.replace(/\s+/gu, ' ').trim().slice(0, MAX_DESCRIPTION) ?? null
}

function titleFrom(html: string): string | null { return html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim().slice(0, MAX_TITLE) ?? null }
export function parseLinkMetadata(html: string, url: URL): LinkMetadata {
  return { url: url.toString(), hostname: url.hostname, title: meta(html, 'og:title') ?? meta(html, 'twitter:title') ?? titleFrom(html), description: meta(html, 'og:description') ?? meta(html, 'twitter:description') ?? meta(html, 'description'), imageUrl: meta(html, 'og:image') ?? meta(html, 'twitter:image') }
}

export async function resolveLinkMetadata(raw: string): Promise<LinkMetadata> {
  let url = await assertSafeRemoteUrl(raw)
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(url, { redirect: 'manual', headers: { accept: 'text/html', 'user-agent': 'NYX-LinkPreview/1.0' }, signal: controller.signal })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); if (!location) throw new Error('LINK_PREVIEW_FAILED')
        url = await assertSafeRemoteUrl(new URL(location, url).toString()); continue
      }
      if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) throw new Error('LINK_PREVIEW_FAILED')
      const length = Number(response.headers.get('content-length') ?? 0); if (length > MAX_HTML_BYTES) throw new Error('LINK_PREVIEW_TOO_LARGE')
      const reader = response.body?.getReader(); if (!reader) throw new Error('LINK_PREVIEW_FAILED')
      const chunks: Uint8Array[] = []; let total = 0
      while (true) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > MAX_HTML_BYTES) throw new Error('LINK_PREVIEW_TOO_LARGE'); chunks.push(next.value) }
      const html = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
      const result = parseLinkMetadata(html, url)
      if (result.imageUrl) { try { const image = await assertSafeRemoteUrl(new URL(result.imageUrl, url).toString()); result.imageUrl = image.protocol === 'https:' ? image.toString() : null } catch { result.imageUrl = null } }
      return result
    } finally { clearTimeout(timer) }
  }
  throw new Error('LINK_PREVIEW_REDIRECT_LIMIT')
}
