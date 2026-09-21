import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-fallback">
      <span className="eyebrow">404 / NOT IN THE LEDGER</span>
      <h1>That workspace view is gone.</h1>
      <p>The address does not point to an available portal route.</p>
      <Link className="button button-primary" href="/login">Return to sign in</Link>
    </main>
  );
}
