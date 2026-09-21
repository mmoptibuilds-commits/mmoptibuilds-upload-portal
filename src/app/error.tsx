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
      <span className="eyebrow">ROUTE INTERRUPTED</span>
      <h1>This view could not load.</h1>
      <p>Your session is still protected. Try the view again, or return to the sign-in screen if the problem continues.</p>
      <button className="button button-primary" type="button" onClick={reset}>Try again</button>
    </main>
  );
}
