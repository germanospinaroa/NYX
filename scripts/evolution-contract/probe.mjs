#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const SECRET_KEYS = /api.?key|authorization|token|secret|password|qr|base64/i;
const PHONE_KEYS = /^(number|phone|remotejid|remotejidalt|participant|participantalt|ownerjid|senderpn|senderlid|chatid|from|to|destination|recipient)$/i;
const IDENTIFIER_KEYS = /message.?id|instance.?id|eventid|stanzaid|^id$/i;

export function redact(value, key = '') {
  if (SECRET_KEYS.test(key)) return '[REDACTED]';
  if (PHONE_KEYS.test(key)) return '[REDACTED_PHONE]';
  if (IDENTIFIER_KEYS.test(key)) return '[REDACTED_ID]';
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return '[REDACTED_URL]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redact(childValue, childKey),
    ]));
  }
  return value;
}

export function assertLiveSendAllowed({
  allowLiveSend = process.env.NYX_ALLOW_LIVE_SEND,
  acknowledgement = process.env.NYX_LIVE_TEST_ACK,
  authorizedNumber = process.env.NYX_AUTHORIZED_TEST_NUMBER,
  destination,
} = {}) {
  if (allowLiveSend !== '1') {
    throw new Error('Live sends are disabled; set NYX_ALLOW_LIVE_SEND=1 only for a manual authorized test.');
  }
  if (acknowledgement !== 'I_UNDERSTAND_SINGLE_AUTHORIZED_MESSAGE') {
    throw new Error('Live send acknowledgement is required.');
  }
  if (!authorizedNumber) {
    throw new Error('An authorized test recipient is required in memory for a live send.');
  }
  if (!destination || destination !== authorizedNumber) {
    throw new Error('The live-send destination must exactly match the authorized test recipient.');
  }
}

export function buildRequest({ baseUrl, path, apiKey, method = 'GET', body }) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const relativePath = path.replace(/^\/+/, '');
  const url = new URL(relativePath, normalizedBase).toString();
  const headers = { apikey: apiKey, accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return {
    url,
    init: {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    headers,
  };
}

export async function requestJson({
  baseUrl = process.env.EVOLUTION_BASE_URL ?? process.env.NYX_EVOLUTION_BASE_URL,
  apiKey = process.env.EVOLUTION_API_KEY ?? process.env.NYX_EVOLUTION_API_KEY,
  path,
  method = 'GET',
  body,
  timeoutMs = Number(process.env.NYX_EVOLUTION_TIMEOUT_MS ?? 10000),
}) {
  if (!baseUrl) throw new Error('NYX_EVOLUTION_BASE_URL is not configured.');
  if (!apiKey) throw new Error('NYX_EVOLUTION_API_KEY is not configured.');
  if (!path || !path.startsWith('/')) throw new Error('path must start with /.');
  if (method.toUpperCase() !== 'GET') {
    throw new Error('This harness is read-only; only GET requests are permitted.');
  }

  const request = buildRequest({ baseUrl, path, apiKey, method, body });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(request.url, { ...request.init, signal: controller.signal });
    const raw = await response.text();
    let parsed;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = { nonJson: true };
    }
    return {
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
      shape: redact(parsed),
    };
  } catch (error) {
    return {
      status: null,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error?.name === 'AbortError' ? 'timeout' : 'network_error',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function usage() {
  console.error('Usage: node scripts/evolution-contract/probe.mjs GET /health');
  console.error('Requires NYX_EVOLUTION_BASE_URL and NYX_EVOLUTION_API_KEY in the process environment.');
  console.error('Mutating requests are not supported by this harness.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , method = 'GET', path] = process.argv;
  if (!path || !/^GET$/i.test(method)) {
    usage();
    process.exitCode = 2;
  } else {
    const result = await requestJson({ method: method.toUpperCase(), path });
    console.log(JSON.stringify(result, null, 2));
  }
}
