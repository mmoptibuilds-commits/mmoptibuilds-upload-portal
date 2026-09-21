export default function Loading() {
  return (
    <main className="route-fallback" aria-busy="true" aria-live="polite">
      <span className="eyebrow">WORKSPACE STARTING</span>
      <h1>Loading your workspace.</h1>
      <p>Checking the private session and preparing the next view.</p>
      <div className="progress-track" aria-hidden="true"><span className="loading-bar" /></div>
    </main>
  );
}
