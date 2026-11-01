import type { Guide } from './schema';

type Composio = Guide['composio'];

const NOT_CHECKED: Composio = {
  managedAuth: 'unknown',
  source: 'none',
  note: 'Not checked. Composio publishes this per toolkit (composio_managed_auth_schemes). Set COMPOSIO_API_KEY to look it up.',
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Toolkit slugs to try, most specific first. Composio slugs are short ("quickbooks", "googlecalendar"),
 * while a guide's app name can be long ("QuickBooks Online (Intuit Developer)").
 */
export function slugCandidates(appName: string): string[] {
  const withoutParens = appName.replace(/\([^)]*\)/g, ' ').trim();
  const firstWord = withoutParens.split(/\s+/)[0] ?? '';
  const out = [squash(withoutParens), squash(firstWord), squash(appName)].filter(Boolean);
  return [...new Set(out)];
}

/**
 * Asks Composio's toolkit API whether it provides the OAuth app for this app.
 * The field name comes from Composio's managed-auth docs. An empty list means you register your own.
 * Never throws: any failure returns "unknown" with the reason.
 */
export async function lookupComposio(appName: string, fetchImpl: typeof fetch = fetch): Promise<Composio> {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) return NOT_CHECKED;
  const slugs = slugCandidates(appName);
  if (slugs.length === 0) return NOT_CHECKED;
  // Composio user keys start with "uak_" and use a different header from project keys.
  const headers: Record<string, string> = key.startsWith('uak_') ? { 'x-user-api-key': key } : { 'x-api-key': key };

  try {
    for (const slug of slugs) {
      const res = await fetchImpl(`https://backend.composio.dev/api/v3.1/toolkits/${encodeURIComponent(slug)}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404) continue;
      if (res.status === 401 || res.status === 403) {
        return {
          managedAuth: 'unknown',
          source: 'api',
          note: `Composio rejected the API key (HTTP ${res.status}), so nothing was looked up. Use a project API key from the Composio dashboard.`,
        };
      }
      if (!res.ok) {
        return { managedAuth: 'unknown', source: 'api', note: `Composio API answered HTTP ${res.status}.` };
      }
      const data = (await res.json()) as { composio_managed_auth_schemes?: unknown };
      const schemes = data?.composio_managed_auth_schemes;
      if (!Array.isArray(schemes)) {
        return { managedAuth: 'unknown', source: 'api', note: `Composio's "${slug}" toolkit had no composio_managed_auth_schemes field.` };
      }
      if (schemes.length > 0) {
        return {
          managedAuth: 'yes',
          source: 'api',
          note: `Composio toolkit "${slug}" provides the OAuth app (${schemes.map(String).join(', ')}). Bring your own only for your branding, custom scopes, separate rate limits or custom instances.`,
        };
      }
      return {
        managedAuth: 'no',
        source: 'api',
        note: `Composio toolkit "${slug}" does not provide an OAuth app. Register your own and create a custom auth config.`,
      };
    }
    return {
      managedAuth: 'unknown',
      source: 'api',
      note: `No Composio toolkit found under ${slugs.map((s) => `"${s}"`).join(' or ')}. Search Composio's toolkit directory by hand.`,
    };
  } catch (e) {
    return { managedAuth: 'unknown', source: 'api', note: `Composio lookup failed: ${e instanceof Error ? e.message : 'unknown error'}.` };
  }
}
