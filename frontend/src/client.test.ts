import test from 'node:test';
import assert from 'node:assert/strict';
import { api, getAccessToken, setAccessToken } from './api/client.js';

test('Frontend API Client: Access Token Injection and Memory Storage', () => {
  setAccessToken('test-jwt-token-xyz');
  assert.equal(getAccessToken(), 'test-jwt-token-xyz', 'Token must be stored in memory');

  setAccessToken(null);
  assert.equal(getAccessToken(), null, 'Token must be clearable from memory');
});
