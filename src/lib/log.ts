export function log(event: Record<string, unknown>) {
  // Keep capabilities, passwords, provider session URLs, and full uploaded filenames out of logs.
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
}
