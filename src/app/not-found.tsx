import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-fallback">
      <span className="route-kicker">Client upload portal</span>
      <h1>Page not found</h1>
      <p>This page is unavailable. Return to the sign-in screen to continue.</p>
      <Link className="button button-primary" href="/login">Return to sign in</Link>
    </main>
  );
}
