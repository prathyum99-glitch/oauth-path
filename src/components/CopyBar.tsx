'use client';

import { useState } from 'react';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyBar({ markdown }: { markdown: string }) {
  const [state, setState] = useState<'idle' | 'link' | 'md' | 'fail'>('idle');

  async function run(kind: 'link' | 'md') {
    const text = kind === 'link' ? window.location.href : markdown.replace('{{URL}}', window.location.href);
    const ok = await copy(text);
    setState(ok ? kind : 'fail');
    window.setTimeout(() => setState('idle'), 2200);
  }

  return (
    <div className="copybar" role="group" aria-label="Share this guide">
      <button type="button" className="btn btn--ghost" onClick={() => run('link')}>
        {state === 'link' ? 'Link copied' : 'Copy link'}
      </button>
      <button type="button" className="btn btn--ghost" onClick={() => run('md')}>
        {state === 'md' ? 'Markdown copied' : 'Copy as Markdown'}
      </button>
      <span className="copybar__status" role="status" aria-live="polite">
        {state === 'fail' ? 'Copy was blocked by the browser. Select the page text instead.' : ''}
      </span>
    </div>
  );
}
