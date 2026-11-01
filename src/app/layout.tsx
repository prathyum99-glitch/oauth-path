import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import '@fontsource-variable/schibsted-grotesk';
import '@fontsource-variable/source-serif-4';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'OAuth Path', template: '%s · OAuth Path' },
  description:
    'How hard is it to get an OAuth app approved? Plain-language guides with time, requirements, what an agent can do, and the evidence behind each claim. Not on the list? An agent researches it live.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site">
          <div className="wrap site__inner">
            <Link href="/" className="site__brand">
              <span className="site__mark" aria-hidden="true" />
              OAuth Path
            </Link>
            <nav aria-label="Main" className="site__nav">
              <Link href="/">Guides</Link>
              <Link href="/new">Investigate an app</Link>
            </nav>
          </div>
        </header>
        <main id="main" className="wrap main">
          {children}
        </main>
        <footer className="site-foot">
          <div className="wrap">
            <p>
              Guides are researched from each provider's own pages. Every claim says how it is supported, and nothing is called tested unless
              a person ran the setup. Provider rules change, so check the linked page before you commit. This is not legal or compliance advice.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
