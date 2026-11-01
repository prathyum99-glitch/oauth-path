import type { Guide } from './schema';

type Composio = Guide['composio'];

const NOT_CHECKED: Composio = {
  managedAuth: 'unknown',
  source: 'none',
  note: 'Not checked. Composio publishes this per toolkit (composio_managed_auth_schemes). Set COMPOSIO_API_KEY to look it up.',
};

/**
 * Asks Composio's toolkit API whether it provides the OAuth app for this app.
 * The field name comes from Composio's managed-auth docs. An empty list means you register your own.
 * Never throws: any failure returns "unknown" with the reason.
 */
export async function lookupComposio(appName: string, fetchImpl: typeof fetch = fetch): Promise<Composio> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) return NOT_CHECKED;
  const slug = appName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return NOT_CHECKED;
  try {
    const res = await fetchImpl(`https://backend.composio.dev/api/v3.1/toolkits/${encodeURIComponent(slug)}`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      return { managedAuth: 'unknown', source: 'api', note: `No Composio toolkit found with the slug "${slug}".` };
    }
    if (!res.ok) {
      return { managedAuth: 'unknown', source: 'api', note: `Composio API answered HTTP ${res.status}.` };
    }
    const data = (await res.json()) as { composio_managed_auth_schemes?: unknown };
    const schemes = data?.composio_managed_auth_schemes;
    if (!Array.isArray(schemes)) {
      return { managedAuth: 'unknown', source: 'api', note: 'Composio response had no composio_managed_auth_schemes field.' };
    }
    if (schemes.length > 0) {
      return {
        managedAuth: 'yes',
        source: 'api',
        note: `Composio provides the OAuth app (${schemes.map(String).join(', ')}). Bring your own only for your branding, custom scopes, separate rate limits or custom instances.`,
      };
    }
    return {
      managedAuth: 'no',
      source: 'api',
      note: 'Composio does not provide an OAuth app for this toolkit. Register your own and create a custom auth config.',
    };
  } catch (e) {
    return { managedAuth: 'unknown', source: 'api', note: `Composio lookup failed: ${e instanceof Error ? e.message : 'unknown error'}.` };
  }
}
