import type { Guide } from '@/lib/schema';
import { safeHref } from '@/lib/safe-href';

const MANAGED_DOCS = 'https://docs.composio.dev/toolkits/managed-auth';
const CALLBACK = 'https://backend.composio.dev/api/v3/toolkits/auth/callback';

/** What this means for someone wiring the app into Composio. The Composio facts come from Composio's docs. */
export function ComposioBlock({ composio, appName }: { composio: Guide['composio']; appName: string }) {
  const managed = composio.managedAuth;
  return (
    <section className="section" aria-labelledby="composio-h">
      <h2 id="composio-h" className="section__title">If you connect {appName} through Composio</h2>
      <div className="panel">
        {managed === 'yes' && (
          <p>
            Composio has an OAuth app for this toolkit, so you can start without registering your own. Register your own app when you
            need your name on the consent screen, your own scopes or your own rate limits. Then this guide applies to you.
          </p>
        )}
        {managed === 'no' && (
          <p>
            Composio does not provide an OAuth app for this toolkit, so you register your own with the provider. This guide is that path.
          </p>
        )}
        {managed === 'unknown' && (
          <p>
            Whether Composio provides the OAuth app for this toolkit was not looked up. Composio publishes it per toolkit, so check
            before you register anything: if it does, you can skip this guide until you need your own app.
          </p>
        )}
        <p>
          Once the provider gives you a client ID and secret, create a custom auth config in Composio and add{' '}
          <code className="code">{CALLBACK}</code> as a redirect URI in the provider's console.
        </p>
        <p className="muted small">
          {composio.note}{' '}
          <a href={safeHref(MANAGED_DOCS) ?? undefined} rel="noopener noreferrer" target="_blank">Composio: managed and custom auth</a>
        </p>
      </div>
    </section>
  );
}
