"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the user-facing message generic while preserving the digest in the
    // browser console for production incident correlation.
    console.error("Portal route error", { digest: error.digest });
  }, [error]);

  return (
    <main className="route-fallback" role="alert">
      <span className="route-kicker">Client upload portal</span>
      <h1>Something went wrong</h1>
      <p>Refresh this view. If the problem continues, contact mmoptibuilds.</p>
      <button className="button button-primary" type="button" onClick={reset}>Try again</button>
    </main>
  );
}
