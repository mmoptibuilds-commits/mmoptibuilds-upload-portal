export default function Loading() {
  return (
    <main className="route-fallback" role="status" aria-live="polite">
      <span className="route-kicker">Client upload portal</span>
      <h1>Loading your workspace</h1>
      <p>Please wait while the portal is prepared.</p>
    </main>
  );
}
