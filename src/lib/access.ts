import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Optional access code for live generation. Set ACCESS_CODE on the deployment to require it.
 * Only the agent is gated: the guides, saved share links and the home page stay open to everyone.
 */
export function accessCodeRequired(): boolean {
  return Boolean(process.env.ACCESS_CODE?.trim());
}

/** True when no code is required, or when `given` matches it. Compares hashes so timing reveals nothing. */
export function accessCodeOk(given: unknown): boolean {
  const want = process.env.ACCESS_CODE?.trim();
  if (!want) return true;
  if (typeof given !== 'string' || given.trim() === '') return false;
  const a = createHash('sha256').update(given.trim()).digest();
  const b = createHash('sha256').update(want).digest();
  return timingSafeEqual(a, b);
}
