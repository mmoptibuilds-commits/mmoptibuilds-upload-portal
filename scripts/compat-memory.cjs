// Some restricted containers expose a Node runtime where libuv cannot read RSS.
// Preserve real metrics everywhere else; only prevent a build-time crash in that case.
try {
  process.memoryUsage();
} catch (error) {
  if (error && error.code === "ENOENT" && error.syscall === "uv_resident_set_memory") {
    const fallback = () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 });
    process.memoryUsage = fallback;
    process.memoryUsage.rss = () => 0;
  } else {
    throw error;
  }
}
