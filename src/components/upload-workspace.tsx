"use client";

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CHUNK_SIZE, MAX_CONCURRENCY } from "@/lib/constants";
import { nextOffset, retryDelay } from "@/lib/upload-protocol";
import type { UploadItem, UploadStatus } from "@/lib/types";
import { EmptyState, formatBytes, formatDuration, Icon, RippleButton, Status } from "@/components/ui";

const run = new Set<string>();
const fileId = () => crypto.randomUUID();
type Entry = FileSystemEntry & { isFile: boolean; isDirectory: boolean; file: (success: (file: File) => void, error?: (error: DOMException) => void) => void; createReader: () => FileSystemDirectoryReader };

async function readEntries(reader: FileSystemDirectoryReader) {
  const all: FileSystemEntry[] = [];
  let part: FileSystemEntry[];
  do {
    part = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    all.push(...part);
  } while (part.length);
  return all;
}

async function traverse(entry: Entry, prefix = ""): Promise<Array<{ file: File; path: string }>> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [{ file, path: `${prefix}${file.name}` }];
  }
  if (entry.isDirectory) {
    const children = await readEntries(entry.createReader());
    return (await Promise.all(children.map((child) => traverse(child as Entry, `${prefix}${entry.name}/`)))).flat();
  }
  return [];
}

async function droppedFiles(data: DataTransfer) {
  const entries = Array.from(data.items).map((item) => item.webkitGetAsEntry?.()).filter(Boolean) as Entry[];
  if (entries.length) return (await Promise.all(entries.map((entry) => traverse(entry)))).flat();
  return Array.from(data.files).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

function safeUploadPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean).filter((part) => part !== "." && part !== "..").join("/");
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("Retry-After");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function waitForRetry(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Paused", "AbortError");
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  if (signal.aborted) throw new DOMException("Paused", "AbortError");
}

async function resumeProbe(url: string, size: number, abort: AbortSignal) {
  const response = await fetch(url, { method: "PUT", headers: { "Content-Range": `bytes */${size}` }, signal: abort });
  if (response.status === 308) return { offset: nextOffset(response.headers.get("Range"), 0) };
  if (response.ok) {
    const final = await response.json().catch(() => null) as { id?: string } | null;
    return { offset: size, fileId: final?.id };
  }
  if (response.status === 404) throw new Error("This Drive upload session expired. Select Retry to start this file again.");
  throw new Error(`Drive could not recover the upload (${response.status}).`);
}

async function directUpload(item: UploadItem, onProgress: (bytes: number, speed: number) => void, abort: AbortSignal) {
  if (!item.sessionUrl) throw new Error("No upload session exists.");
  const start = performance.now();
  let probe = await resumeProbe(item.sessionUrl, item.file.size, abort);
  if (probe.fileId) return probe.fileId;
  let offset = probe.offset;
  let attempts = 0;
  onProgress(offset, offset / Math.max((performance.now() - start) / 1000, 0.001));

  while (offset < item.file.size) {
    if (abort.aborted) throw new DOMException("Paused", "AbortError");
    const end = Math.min(offset + CHUNK_SIZE, item.file.size);
    const response = await fetch(item.sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Type": item.file.type || "application/octet-stream",
        "Content-Range": `bytes ${offset}-${end - 1}/${item.file.size}`,
      },
      body: item.file.slice(offset, end),
      signal: abort,
    });

    if (response.status === 308) {
      // A missing Range means Drive confirmed no bytes, so resend from the last known offset.
      offset = nextOffset(response.headers.get("Range"), 0);
      onProgress(offset, offset / Math.max((performance.now() - start) / 1000, 0.001));
      attempts = 0;
      continue;
    }
    if (response.ok) {
      const final = await response.json().catch(() => null) as { id?: string } | null;
      if (!final?.id) throw new Error("Drive completed the transfer without returning a file id.");
      onProgress(item.file.size, item.file.size / Math.max((performance.now() - start) / 1000, 0.001));
      return final.id;
    }

    const detail = response.status === 403 ? await response.clone().text().catch(() => "") : "";
    const retryable = response.status === 429 || response.status >= 500 || (response.status === 403 && /rateLimitExceeded|userRateLimitExceeded|backendError|temporarilyUnavailable/i.test(detail));
    if (retryable && attempts < 6) {
      await waitForRetry(retryDelay(attempts, retryAfterMs(response)), abort);
      probe = await resumeProbe(item.sessionUrl, item.file.size, abort);
      if (probe.fileId) return probe.fileId;
      offset = probe.offset;
      attempts += 1;
      continue;
    }
    if (response.status === 404) throw new Error("This Drive upload session expired. Select Retry to start this file again.");
    throw new Error(`Drive rejected this transfer (${response.status}).`);
  }

  throw new Error("Drive did not return a file id for this transfer.");
}

export function UploadWorkspace({ username }: { username: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const aborters = useRef(new Map<string, AbortController>());
  const starting = useRef(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(true);
  const [complete, setComplete] = useState(false);
  const [startingState, setStartingState] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const off = () => {
      setOnline(false);
      setMessage("Connection lost. Uploads are paused safely.");
      aborters.current.forEach((controller) => controller.abort());
      setItems((current) => current.map((item) => item.status === "uploading" ? { ...item, status: "paused", speed: 0 } : item));
    };
    const on = () => { setOnline(true); setMessage("Connection restored. Resume queued files when ready."); };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, []);

  useEffect(() => {
    if (items.length > 0 && items.every((item) => item.status === "completed")) setComplete(true);
  }, [items]);

  const total = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);
  const uploaded = useMemo(() => items.reduce((sum, item) => sum + item.uploadedBytes, 0), [items]);
  const speed = useMemo(() => items.reduce((sum, item) => sum + item.speed, 0), [items]);
  const active = items.some((item) => item.status === "uploading" || item.status === "preparing" || item.status === "reconnecting" || item.status === "retrying");
  const canPause = items.some((item) => aborters.current.has(item.id));
  const percentage = Math.min(100, Math.round(total ? uploaded / total * 100 : 0));

  function add(entries: Array<{ file: File; path: string }>) {
    if (batchId) { setMessage("This batch is already prepared. Finish or refresh it before adding files."); return; }
    const additions = entries.map(({ file, path }) => ({ id: fileId(), file, relativePath: safeUploadPath(path || file.name), status: "queued" as UploadStatus, uploadedBytes: 0, speed: 0, resetSession: true })).filter((item) => item.relativePath);
    setItems((current) => {
      const known = new Set(current.map((item) => `${item.relativePath}:${item.file.size}:${item.file.lastModified}`));
      return [...current, ...additions.filter((item) => !known.has(`${item.relativePath}:${item.file.size}:${item.file.lastModified}`))];
    });
    if (!additions.length) setMessage("No readable files were found in that selection.");
    setComplete(false);
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    add(Array.from(event.target.files ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name })));
    event.target.value = "";
  }

  function update(id: string, change: Partial<UploadItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...change } : item));
  }

  function pause(id: string) {
    aborters.current.get(id)?.abort();
    update(id, { status: "paused", speed: 0 });
  }

  function pauseAll() {
    items.filter((item) => aborters.current.has(item.id)).forEach((item) => pause(item.id));
  }

  async function prepareBatch() {
    if (batchId) return batchId;
    if (!items.length) throw new Error("Choose at least one file first.");
    const label = items[0]?.relativePath.split("/")[0] || "Client upload";
    const response = await fetch("/api/uploads/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: label, fileCount: items.length, totalBytes: total }) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Could not prepare the upload batch.");
    setBatchId(data.batchId);
    return data.batchId as string;
  }

  async function transfer(id: string, desiredBatch?: string) {
    if (run.has(id)) return;
    run.add(id);
    let item = items.find((candidate) => candidate.id === id);
    if (!item) { run.delete(id); return; }
    try {
      update(id, { status: item.sessionUrl || item.remoteFileId ? "reconnecting" : "preparing", error: undefined });
      const targetBatch = desiredBatch ?? await prepareBatch();
      if (!item.sessionUrl && !item.remoteFileId) {
        const init = await fetch("/api/uploads/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: targetBatch, relativePath: item.relativePath, size: item.file.size, mimeType: item.file.type || "application/octet-stream", resetSession: item.resetSession ?? true }) });
        const data = await init.json().catch(() => null);
        if (!init.ok) throw new Error(data?.error || "Could not create the Drive upload session.");
        item = { ...item, sessionUrl: data.sessionUrl || undefined, dbFileId: data.fileId, remoteFileId: data.driveFileId || undefined, resetSession: false, status: "uploading" };
        update(id, { sessionUrl: item.sessionUrl, dbFileId: item.dbFileId, remoteFileId: item.remoteFileId, resetSession: false, status: "uploading" });
      }
      const controller = new AbortController();
      aborters.current.set(id, controller);
      update(id, { status: "uploading" });
      let remoteFileId = item.remoteFileId;
      if (!remoteFileId) {
        remoteFileId = await directUpload(item, (uploadedBytes, currentSpeed) => update(id, { uploadedBytes, speed: currentSpeed }), controller.signal);
        update(id, { remoteFileId });
      }
      if (!item.dbFileId) throw new Error("The server did not return an upload file id.");
      const done = await fetch("/api/uploads/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: item.dbFileId, driveFileId: remoteFileId }) });
      const doneData = await done.json().catch(() => null);
      if (!done.ok) throw new Error(doneData?.error || "Drive received the file, but finalization needs a retry.");
      update(id, { status: "completed", uploadedBytes: item.file.size, speed: 0, remoteFileId });
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        const errorText = error instanceof Error ? error.message : "Upload failed.";
        const expired = /session expired|No upload session|rejected this transfer \(404\)/i.test(errorText);
        update(id, { status: "failed", speed: 0, error: errorText, ...(expired ? { sessionUrl: undefined, dbFileId: undefined, remoteFileId: undefined, resetSession: true, uploadedBytes: 0 } : {}) });
      }
    } finally {
      aborters.current.delete(id);
      run.delete(id);
    }
  }

  async function start() {
    if (starting.current) return;
    starting.current = true;
    setStartingState(true);
    try {
      setMessage("");
      const targetBatch = await prepareBatch();
      const pending = items.filter((item) => ["queued", "paused", "failed"].includes(item.status));
      for (let index = 0; index < pending.length; index += MAX_CONCURRENCY) await Promise.all(pending.slice(index, index + MAX_CONCURRENCY).map((item) => transfer(item.id, targetBatch)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start upload.");
    } finally {
      starting.current = false;
      setStartingState(false);
    }
  }

  function retry(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    update(id, { status: "queued", error: undefined, uploadedBytes: item?.sessionUrl || item?.remoteFileId ? item.uploadedBytes : 0 });
    void transfer(id, batchId ?? undefined);
  }

  function remove(id: string) {
    if (batchId) { setMessage("This batch is already prepared. Finish or refresh it before changing the queue."); return; }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function resetQueue() {
    if (active) return;
    setItems([]);
    setBatchId(null);
    setComplete(false);
    setMessage("");
  }

  return <div className="workspace">
    <header className="page-header">
      <div><span className="eyebrow">CLIENT TRANSFER / {username.toUpperCase()}</span><h1>Secure asset upload</h1><p>Files go directly to mmoptibuilds storage. Folder structure stays intact.</p></div>
      <Status tone={online ? "green" : "orange"}>{online ? "Connection ready" : "Offline"}</Status>
    </header>
    {complete ? <Completion total={total} count={items.length} onReset={() => { setItems([]); setBatchId(null); setComplete(false); setMessage(""); }} /> : <>
      <section className="upload-grid" aria-labelledby="drop-title">
        <div className={`drop-zone ${dragging ? "dragging" : ""}`} role="region" tabIndex={0} aria-label="Drop files here, or press Enter to choose files" aria-describedby="drop-description" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.current?.click(); } }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={async (event: DragEvent) => { event.preventDefault(); setDragging(false); add(await droppedFiles(event.dataTransfer)); }}>
          <div className="drop-visual" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><b><Icon name="upload" size={30} /></b></div>
          <span className="eyebrow">ASSET INTAKE</span><h2 id="drop-title">Drop files or a complete folder.</h2><p id="drop-description">Photos, video, source files, archives, executables, and unknown formats are accepted as untrusted data.</p>
          <div className="drop-actions"><RippleButton className="button-primary" type="button" onClick={() => fileInput.current?.click()}>Select files</RippleButton><RippleButton className="button-secondary" type="button" onClick={() => folderInput.current?.click()}>Select folder</RippleButton></div>
          <input ref={fileInput} className="sr-only" aria-label="Choose files to upload" type="file" multiple onChange={choose} /><input ref={folderInput} className="sr-only" aria-label="Choose a folder to upload" type="file" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={choose} />
          <small>Folder selection depends on browser support. You can always select files.</small>
        </div>
        <aside className="transfer-side" aria-label="Transfer protocol"><span className="eyebrow">TRANSFER PROTOCOL</span><ol><li><i>01</i><span><b>Queue</b>Inspect paths before sending</span></li><li><i>02</i><span><b>Resumable transfer</b>Pause and reconnect safely</span></li><li><i>03</i><span><b>Private delivery</b>No public Drive links</span></li></ol></aside>
      </section>
      {items.length ? <section className="queue-panel material-surface" aria-labelledby="queue-title">
        <div className="queue-head"><div><span className="eyebrow">UPLOAD QUEUE</span><h2 id="queue-title">{items.length} {items.length === 1 ? "file" : "files"} · {formatBytes(total)}</h2></div><div className="queue-progress"><b>{percentage}%</b><span>{formatBytes(uploaded)} / {formatBytes(total)}</span></div></div>
        <div className="progress-track" role="progressbar" aria-label="Overall upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${percentage}% uploaded`}><span style={{ width: `${percentage}%` }} /></div>
        <div className="queue-controls"><p>{active ? `${formatBytes(speed)}/s · ${formatDuration((total - uploaded) / Math.max(speed, 1))} remaining` : "Review your queue, then start the secure transfer."}</p><div>{active && canPause && <RippleButton className="button-secondary" type="button" onClick={pauseAll}><Icon name="pause" size={15} />Pause all</RippleButton>}{batchId && !active && <RippleButton className="button-secondary" type="button" onClick={resetQueue}>Start over</RippleButton>}<RippleButton className="button-primary" type="button" onClick={start} disabled={active || startingState || !online}>{active || startingState ? "Transferring…" : "Start transfer"}<Icon name="arrow-right" size={16} /></RippleButton></div></div>
        {message && <p className="queue-message" role="status" aria-live="polite">{message}</p>}
        <div className="upload-list">{items.map((item) => <UploadRow key={item.id} item={item} onPause={() => pause(item.id)} onRetry={() => retry(item.id)} onRemove={() => remove(item.id)} canRemove={!batchId} />)}</div>
      </section> : <EmptyState title="Your queue is clear." detail="Choose individual files, a folder, or drag them into the transfer area." />}
    </>}
  </div>;
}

function UploadRow({ item, onPause, onRetry, onRemove, canRemove }: { item: UploadItem; onPause: () => void; onRetry: () => void; onRemove: () => void; canRemove: boolean }) {
  const reduce = useReducedMotion();
  const percent = item.file.size ? Math.min(100, item.uploadedBytes / item.file.size * 100) : item.remoteFileId ? 100 : 0;
  const tone = item.status === "completed" ? "green" : item.status === "failed" ? "red" : item.status === "paused" ? "orange" : "blue";
  return <motion.article className="upload-row" aria-label={`Upload ${item.relativePath}`} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 8 }} animate={reduce ? undefined : { opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, x: 20 }}>
    <div className="file-icon" aria-hidden="true"><Icon name={item.relativePath.includes("/") ? "folder" : "file"} size={16} /></div>
    <div className="file-info"><b title={item.relativePath}>{item.file.name}</b><span>{item.relativePath.replace(`/${item.file.name}`, "") || "Root"} · {formatBytes(item.file.size)}</span><div className="row-progress" role="progressbar" aria-label={`${item.file.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>{item.error && <span className="row-error" role="alert">{item.error}</span>}</div>
    <div className="file-stats"><Status tone={tone}>{item.status.replace("_", " ")}</Status><span>{Math.round(percent)}% · {item.speed ? `${formatBytes(item.speed)}/s` : formatBytes(item.uploadedBytes)}</span></div>
    <div className="row-actions">{item.status === "uploading" && <button type="button" onClick={onPause}><Icon name="pause" size={14} /><span>Pause</span></button>}{["failed", "paused"].includes(item.status) && <button type="button" onClick={onRetry}><Icon name="play" size={14} /><span>Retry</span></button>}{canRemove && ["queued", "failed", "paused"].includes(item.status) && <button type="button" aria-label={`Remove ${item.file.name}`} title={`Remove ${item.file.name}`} onClick={onRemove}><Icon name="x" size={15} /><span className="sr-only">Remove</span></button>}</div>
  </motion.article>;
}

function Completion({ total, count, onReset }: { total: number; count: number; onReset: () => void }) {
  const reduce = useReducedMotion();
  return <motion.section className="completion material-glass" aria-labelledby="completion-title" initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={reduce ? undefined : { opacity: 1, scale: 1 }}><div className="complete-mark" aria-hidden="true"><Icon name="check" size={30} /></div><span className="eyebrow">TRANSFER COMPLETE</span><h2 id="completion-title">Files sent securely.</h2><p>mmoptibuilds has received your upload. You may close this page.</p><div className="complete-stats"><span><b>{count}</b>files</span><span><b>{formatBytes(total)}</b>delivered</span><span><b>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())}</b>completed</span></div><RippleButton className="button-primary" type="button" onClick={onReset}>Upload more files<Icon name="arrow-right" size={16} /></RippleButton></motion.section>;
}
