import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { accessCodeOk, accessCodeRequired } from '../src/lib/access';

afterEach(() => {
  delete process.env.ACCESS_CODE;
});

test('no code configured means open access', () => {
  assert.equal(accessCodeRequired(), false);
  assert.equal(accessCodeOk(undefined), true);
});

test('a blank code counts as not configured', () => {
  process.env.ACCESS_CODE = '   ';
  assert.equal(accessCodeRequired(), false);
});

test('only the exact code passes, ignoring surrounding spaces', () => {
  process.env.ACCESS_CODE = 'open-sesame';
  assert.equal(accessCodeRequired(), true);
  assert.equal(accessCodeOk('open-sesame'), true);
  assert.equal(accessCodeOk('  open-sesame\n'), true);
  assert.equal(accessCodeOk('open-sesam'), false);
  assert.equal(accessCodeOk(''), false);
  assert.equal(accessCodeOk(undefined), false);
  assert.equal(accessCodeOk(42), false);
});
