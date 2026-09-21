"use client";

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MAX_CONCURRENCY } from "@/lib/constants";
import { fetchWithTimeout } from "@/lib/async-timeouts";
import {
  buildUploadCompletionBody,
  buildUploadInitializationBody,
  createConcurrencyLimiter,
  createSignedTusUpload,
  dedupeUploadEntries,
  parseUploadAuthorization,
  shouldProbeUploadCompletion,
  uploadFailureMessage,
} from "@/lib/upload-protocol";
import type { UploadItem, UploadStatus } from "@/lib/types";
import { CustodyStrip, EmptyState, formatBytes, formatDuration, Icon, RippleButton, Status } from "@/components/ui";

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

type ActiveUpload = ReturnType<typeof createSignedTusUpload>;

export function UploadWorkspace({ username, storageUrl, storageBucket }: { username: string; storageUrl: string; storageBucket: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, ActiveUpload>());
  const running = useRef(new Set<string>());
  const transferDone = useRef(new Map<string, Promise<void>>());
  const transferLimiter = useRef(createConcurrencyLimiter(MAX_CONCURRENCY));
  const starting = useRef(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(true);
  const [complete, setComplete] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null);
  const [startingState, setStartingState] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const off = () => {
      setOnline(false);
      setMessage("Connection lost. Uploads are paused safely.");
      controllers.current.forEach((controller) => { void controller.pause(); });
      setItems((current) => current.map((item) => item.status === "uploading" || item.status === "reconnecting" ? { ...item, status: "paused", speed: 0 } : item));
    };
    const on = () => { setOnline(true); setMessage("Connection restored. Resume queued files when ready."); };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
      controllers.current.forEach((controller) => { void controller.pause(); });
    };
  }, []);

  useEffect(() => {
    if (items.length > 0 && items.every((item) => item.status === "completed")) {
      setComplete(true);
      setConfirmedAt((value) => value ?? new Date());
    }
  }, [items]);

  const total = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);
  const uploaded = useMemo(() => items.reduce((sum, item) => sum + item.uploadedBytes, 0), [items]);
  const speed = useMemo(() => items.reduce((sum, item) => sum + item.speed, 0), [items]);
  const active = items.some((item) => item.status === "uploading" || item.status === "preparing" || item.status === "reconnecting" || item.status === "retrying" || item.status === "finalizing");
  const canPause = items.some((item) => controllers.current.has(item.id));
  const percentage = Math.min(100, Math.round(total ? uploaded / total * 100 : 0));

  function add(entries: Array<{ file: File; path: string }>) {
    if (batchId) { setMessage("This batch is already prepared. Finish or refresh it before adding files."); return; }
    const additions = entries.map(({ file, path }) => ({ id: fileId(), file, relativePath: safeUploadPath(path || file.name), status: "queued" as UploadStatus, uploadedBytes: 0, speed: 0 })).filter((item) => item.relativePath);
    setItems((current) => {
      return [...current, ...dedupeUploadEntries(current, additions)];
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
    const controller = controllers.current.get(id);
    update(id, { status: "paused", speed: 0 });
    if (controller) void controller.pause().finally(() => update(id, { status: "paused", speed: 0 }));
  }

  function pauseAll() {
    items.filter((item) => controllers.current.has(item.id)).forEach((item) => pause(item.id));
  }

  async function prepareBatch() {
    if (batchId) return batchId;
    if (!items.length) throw new Error("Choose at least one file first.");
    const label = items[0]?.relativePath.split("/")[0] || "Client upload";
    const response = await fetchWithTimeout("/api/uploads/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: label, fileCount: items.length, totalBytes: total }) }, 20_000, "Preparing the upload");
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Could not prepare the upload batch.");
    setBatchId(data.batchId);
    return data.batchId as string;
  }

  async function transfer(id: string, desiredBatch?: string) {
    if (running.current.has(id)) return;
    running.current.add(id);
    let item = items.find((candidate) => candidate.id === id);
    if (!item) { running.current.delete(id); return; }
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => { resolveDone = resolve; });
    transferDone.current.set(id, done);
    let releaseSlot: (() => void) | undefined;
    try {
      releaseSlot = await transferLimiter.current.acquire();
      const targetBatch = desiredBatch ?? await prepareBatch();
      let uploadFileId = item.dbFileId;

      if (uploadFileId && shouldProbeUploadCompletion({
        uploadedBytes: item.uploadedBytes,
        totalBytes: item.file.size,
        storageUploaded: item.storageUploaded ?? false,
      })) {
        const probe = await fetchWithTimeout("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildUploadCompletionBody(uploadFileId)),
        }, 30_000, "Confirming the uploaded file");
        const probeData = await probe.json().catch(() => null);
        if (probe.ok) {
          update(id, { status: "completed", uploadedBytes: item.file.size, speed: 0, storageUploaded: true, dbFileId: uploadFileId });
          return;
        }
        if (probe.status !== 409) throw new Error(probeData?.error || "The file's delivery could not be confirmed. Select Retry.");
      }

      if (!item.storageUploaded) {
        update(id, { status: item.uploadedBytes > 0 ? "reconnecting" : "preparing", error: undefined });
        const mimeType = item.file.type || "application/octet-stream";
        const init = await fetchWithTimeout("/api/uploads/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildUploadInitializationBody({
            batchId: targetBatch,
            relativePath: item.relativePath,
            size: item.file.size,
            mimeType,
          })),
        }, 20_000, "Authorizing the file transfer");
        const data = await init.json().catch(() => null);
        if (!init.ok) throw new Error(data?.error || "Could not authorize this file transfer.");
        const authorization = parseUploadAuthorization(data);
        if (!authorization) throw new Error("The server returned an invalid file authorization. Select Retry.");
        uploadFileId = authorization.fileId;
        item = { ...item, dbFileId: authorization.fileId, storagePath: authorization.path };
        update(id, { dbFileId: authorization.fileId, storagePath: authorization.path, status: "uploading" });

        let sampledBytes: number | null = null;
        let sampledAt = performance.now();
        const controller = createSignedTusUpload({
          file: item.file,
          storageUrl,
          bucket: storageBucket,
          authorization,
          contentType: mimeType,
          onProgress: (uploadedBytes) => {
            const now = performance.now();
            const elapsedSeconds = Math.max((now - sampledAt) / 1000, 0.001);
            const currentSpeed = sampledBytes === null || uploadedBytes < sampledBytes ? 0 : (uploadedBytes - sampledBytes) / elapsedSeconds;
            sampledBytes = uploadedBytes;
            sampledAt = now;
            update(id, { uploadedBytes, speed: currentSpeed, status: "uploading" });
          },
        });
        controllers.current.set(id, controller);
        try {
          await controller.start();
        } catch (error) {
          if ((error as DOMException).name === "AbortError") throw error;
          throw new Error(uploadFailureMessage(error));
        }
        item = { ...item, storageUploaded: true, uploadedBytes: item.file.size };
        update(id, { storageUploaded: true, uploadedBytes: item.file.size, speed: 0, status: "finalizing" });
      }

      if (!uploadFileId) throw new Error("The server did not return a file authorization. Select Retry.");
      update(id, { status: "finalizing", speed: 0 });
      const done = await fetchWithTimeout("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildUploadCompletionBody(uploadFileId)),
      }, 30_000, "Confirming the uploaded file");
      const doneData = await done.json().catch(() => null);
      if (!done.ok) throw new Error(doneData?.error || "The file arrived, but confirmation needs a retry.");
      update(id, { status: "completed", uploadedBytes: item.file.size, speed: 0, storageUploaded: true, dbFileId: uploadFileId });
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        const errorText = error instanceof Error ? error.message : "Upload failed.";
        update(id, { status: "failed", speed: 0, error: errorText });
      }
    } finally {
      releaseSlot?.();
      controllers.current.delete(id);
      running.current.delete(id);
      transferDone.current.delete(id);
      resolveDone();
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

  async function retry(id: string) {
    if (!online) {
      setMessage("You are offline. Retry this file after the connection is restored.");
      return;
    }
    const controller = controllers.current.get(id);
    if (controller) await controller.pause();
    const inFlight = transferDone.current.get(id);
    if (inFlight) await inFlight;
    update(id, { status: "queued", error: undefined, speed: 0 });
    void transfer(id, batchId ?? undefined);
  }

  function remove(id: string) {
    if (batchId) { setMessage("This batch is already prepared. Finish or refresh it before changing the queue."); return; }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return <div className="workspace">
    <header className="page-header">
      <div><CustodyStrip route="UPLOAD">INTAKE:{username.toUpperCase()} ▦ CHUNKS:RESUMABLE ▦ PATHS:PRESERVED</CustodyStrip><span className="eyebrow">CLIENT TRANSFER / {username.toUpperCase()}</span><h1>Secure asset upload</h1><p>Files go directly to mmoptibuilds storage. Folder structure stays intact.</p></div>
      <Status tone={online ? "green" : "orange"}>{online ? "Connection ready" : "Offline"}</Status>
    </header>
    {complete ? <Completion total={total} count={items.length} confirmedAt={confirmedAt} onReset={() => { setItems([]); setBatchId(null); setComplete(false); setConfirmedAt(null); setMessage(""); }} /> : <>
      <section className="upload-grid" aria-labelledby="drop-title">
        <div className={`drop-zone ${dragging ? "dragging" : ""}`} role="region" aria-label="Drop files here" aria-describedby="drop-description" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={async (event: DragEvent) => { event.preventDefault(); setDragging(false); try { add(await droppedFiles(event.dataTransfer)); } catch { setMessage("The dropped files could not be read. Select them from your device and retry."); } }}>
          <div className="drop-visual" aria-hidden="true"><span>╳╳╳</span><b><Icon name="upload" size={30} /></b><span>▦▦▦</span></div>
          <span className="eyebrow">ASSET INTAKE</span><h2 id="drop-title">Drop files or a complete folder.</h2><p id="drop-description">Photos, video, source files, archives, executables, and unknown formats are accepted as untrusted data.</p>
          <div className="drop-actions"><RippleButton className="button-primary" type="button" onClick={() => fileInput.current?.click()}>Select files</RippleButton><RippleButton className="button-secondary" type="button" onClick={() => folderInput.current?.click()}>Select folder</RippleButton></div>
          <input ref={fileInput} className="sr-only" aria-label="Choose files to upload" type="file" multiple onChange={choose} /><input ref={folderInput} className="sr-only" aria-label="Choose a folder to upload" type="file" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={choose} />
          <small>Folder selection depends on browser support. You can always select files.</small>
        </div>
        <aside className="transfer-side" aria-label="Transfer protocol"><span className="eyebrow">TRANSFER PROTOCOL</span><ol><li><i>01</i><span><b>Queue</b>Inspect paths before sending</span></li><li><i>02</i><span><b>Resumable transfer</b>Pause and reconnect safely</span></li><li><i>03</i><span><b>Private delivery</b>No public file links</span></li></ol></aside>
      </section>
      {items.length ? <section className="queue-panel material-surface" aria-labelledby="queue-title">
        <div className="queue-head"><div><span className="eyebrow">UPLOAD QUEUE</span><h2 id="queue-title">{items.length} {items.length === 1 ? "file" : "files"} · {formatBytes(total)}</h2></div><div className="queue-progress"><b>{percentage}%</b><span>{formatBytes(uploaded)} / {formatBytes(total)}</span></div></div>
        <div className="progress-track" role="progressbar" aria-label="Overall upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${percentage}% uploaded`}><span style={{ width: `${percentage}%` }} /></div>
        <div className="queue-controls"><p>{active ? `${formatBytes(speed)}/s · ${formatDuration((total - uploaded) / Math.max(speed, 1))} remaining` : "Review your queue, then start the secure transfer. Retry resumes the last confirmed chunk when available; otherwise only that file restarts."}</p><div>{active && canPause && <RippleButton className="button-secondary" type="button" onClick={pauseAll}><Icon name="pause" size={15} />Pause all</RippleButton>}<RippleButton className="button-primary" type="button" onClick={start} disabled={active || startingState || !online}>{active || startingState ? "Transferring…" : "Start transfer"}<Icon name="arrow-right" size={16} /></RippleButton></div></div>
        {message && <p className="queue-message" role="status" aria-live="polite">{message}</p>}
        <div className="upload-list">{items.map((item) => <UploadRow key={item.id} item={item} onPause={() => pause(item.id)} onRetry={() => retry(item.id)} onRemove={() => remove(item.id)} canRemove={!batchId} />)}</div>
      </section> : <EmptyState title="Your queue is clear." detail="Choose individual files, a folder, or drag them into the transfer area." />}
    </>}
  </div>;
}

function UploadRow({ item, onPause, onRetry, onRemove, canRemove }: { item: UploadItem; onPause: () => void; onRetry: () => void; onRemove: () => void; canRemove: boolean }) {
  const reduce = useReducedMotion();
  const percent = item.file.size ? Math.min(100, item.uploadedBytes / item.file.size * 100) : item.storageUploaded ? 100 : 0;
  const tone = item.status === "completed" ? "green" : item.status === "failed" ? "red" : item.status === "paused" ? "orange" : "blue";
  return <motion.article className="upload-row" aria-label={`Upload ${item.relativePath}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={reduce ? undefined : { opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, x: 20 }}>
    <div className="file-icon" aria-hidden="true"><Icon name={item.relativePath.includes("/") ? "folder" : "file"} size={16} /></div>
    <div className="file-info"><b title={item.relativePath}>{item.file.name}</b><span>{item.relativePath.replace(`/${item.file.name}`, "") || "Root"} · {formatBytes(item.file.size)}</span><div className="row-progress" role="progressbar" aria-label={`${item.file.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>{item.error && <span className="row-error" role="alert">{item.error}</span>}</div>
    <div className="file-stats"><Status tone={tone}>{item.status.replace("_", " ")}</Status><span>{Math.round(percent)}% · {item.speed ? `${formatBytes(item.speed)}/s` : formatBytes(item.uploadedBytes)}</span></div>
    <div className="row-actions">{item.status === "uploading" && <button type="button" onClick={onPause}><Icon name="pause" size={14} /><span>Pause</span></button>}{["failed", "paused"].includes(item.status) && <button type="button" onClick={onRetry}><Icon name="play" size={14} /><span>Retry</span></button>}{canRemove && ["queued", "failed", "paused"].includes(item.status) && <button type="button" aria-label={`Remove ${item.file.name}`} title={`Remove ${item.file.name}`} onClick={onRemove}><Icon name="x" size={15} /><span className="sr-only">Remove</span></button>}</div>
  </motion.article>;
}

function Completion({ total, count, confirmedAt, onReset }: { total: number; count: number; confirmedAt: Date | null; onReset: () => void }) {
  const reduce = useReducedMotion();
  return <motion.section className="completion material-glass" aria-labelledby="completion-title" initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={reduce ? undefined : { opacity: 1, scale: 1 }}><div className="complete-mark" aria-hidden="true"><Icon name="check" size={30} /></div><span className="eyebrow">TRANSFER COMPLETE</span><h2 id="completion-title">Files sent securely.</h2><p>mmoptibuilds has received your upload. You may close this page.</p><div className="complete-stats"><span><b>{count}</b>files</span><span><b>{formatBytes(total)}</b>delivered</span><span><b>{confirmedAt ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(confirmedAt) : "—"}</b>confirmed</span></div><RippleButton className="button-primary" type="button" onClick={onReset}>Upload more files<Icon name="arrow-right" size={16} /></RippleButton></motion.section>;
}
