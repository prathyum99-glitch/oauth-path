/**
 * Turns the two model-account failures a deployer is most likely to hit into a message that says what to do.
 * Anything else returns null and the caller shows its generic message.
 */
export function describeModelFailure(err: unknown): string | null {
  const text = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/credit balance is too low/i.test(text)) {
    return 'The model account behind this site is out of credit, so the agent could not run. Add credit under Plans & Billing in the Anthropic console, then try again.';
  }
  if (/invalid x-api-key|authentication_error|invalid api key/i.test(text)) {
    return 'The model key on this deployment was rejected. Check ANTHROPIC_API_KEY in the host settings, then redeploy.';
  }
  return null;
}
