import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="hero hero--tight">
      <h1 className="hero__title">That guide does not exist</h1>
      <p className="hero__lede">
        The link may be wrong, or the guide was generated on a server that has since restarted without a database. You can{' '}
        <Link href="/new">investigate the app again</Link> or <Link href="/">browse the guides</Link>.
      </p>
    </section>
  );
}
