import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redact,
  assertLiveSendAllowed,
  buildRequest,
} from './probe.mjs';

test('redact removes secret-like values and full phone-like values', () => {
  const value = {
    apikey: 'TEST_API_KEY_REDACTED',
    authorization: 'Bearer TEST_API_KEY_REDACTED',
    remoteJid: 'TEST_PHONE_REDACTED@s.whatsapp.net',
    manager: 'https://private.example/manager',
    nested: { text: 'safe' },
  };

  assert.deepEqual(redact(value), {
    apikey: '[REDACTED]',
    authorization: '[REDACTED]',
    remoteJid: '[REDACTED_PHONE]',
    manager: '[REDACTED_URL]',
    nested: { text: 'safe' },
  });
});

test('live send is blocked unless explicit acknowledgement and authorized number exist', () => {
  assert.throws(
    () => assertLiveSendAllowed({}),
    /live sends are disabled/i,
  );

  assert.throws(
    () => assertLiveSendAllowed({ allowLiveSend: '1', acknowledgement: 'wrong', authorizedNumber: 'x', destination: 'x' }),
    /acknowledgement/i,
  );

  assert.doesNotThrow(() => assertLiveSendAllowed({
    allowLiveSend: '1',
    acknowledgement: 'I_UNDERSTAND_SINGLE_AUTHORIZED_MESSAGE',
    authorizedNumber: 'x',
    destination: 'x',
  }));
});

test('request builder never includes an API key in the URL', () => {
  const request = buildRequest({
    baseUrl: 'https://evolution.invalid/evolution/',
    path: '/instance/connectionState/nyx-contract-test',
    apiKey: 'TEST_API_KEY_REDACTED',
    method: 'GET',
  });

  assert.equal(request.url, 'https://evolution.invalid/evolution/instance/connectionState/nyx-contract-test');
  assert.equal(request.headers.apikey, 'TEST_API_KEY_REDACTED');
  assert.equal(request.url.includes('TEST_API_KEY_REDACTED'), false);
});

test('requestJson rejects all mutating methods', async () => {
  await assert.rejects(
    () => import('./probe.mjs').then(({ requestJson }) => requestJson({
      baseUrl: 'https://evolution.invalid',
      apiKey: 'TEST_API_KEY_REDACTED',
      path: '/instance/create',
      method: 'POST',
    })),
    /read-only/i,
  );
});
