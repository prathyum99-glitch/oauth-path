import test from 'node:test';
import assert from 'node:assert/strict';
import { describeModelFailure } from '../src/lib/failure';

test('an out-of-credit error says to add credit', () => {
  const err = new Error('{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}');
  assert.match(describeModelFailure(err) ?? '', /out of credit/);
});

test('a rejected key says to check the variable', () => {
  assert.match(describeModelFailure(new Error('401 {"type":"authentication_error","message":"invalid x-api-key"}')) ?? '', /ANTHROPIC_API_KEY/);
});

test('other failures fall through to the generic message', () => {
  assert.equal(describeModelFailure(new Error('socket hang up')), null);
  assert.equal(describeModelFailure(undefined), null);
});
