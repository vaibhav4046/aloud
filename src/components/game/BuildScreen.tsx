"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, FileText, Sparkles, Upload } from "lucide-react";
import type { Run } from "@/lib/game/types";
import { rememberSubject } from "@/components/mirror";
import { writeStoredCourse } from "@/components/course/CoursePicker";
import { SAMPLE_COURSE_ID } from "@/lib/sample-course";
import type { Subject } from "@/lib/courses/types";
import {
  applyMessage,
  applyRun,
  buildErrorCopy,
  initialBuild,
  parseNdjson,
  validateIntake,
  type BuildState,
  type StreamMessage,
} from "./build-model";
import { fetchRun } from "./game-client";
import { ErrorState } from "./StateViews";

type Tab = "files" | "paste";
type Msg = StreamMessage & { record?: Subject };

const HOLD_MS = 900;

function distinctConcepts(run: Run): number {
  return new Set(run.levels.flatMap((l) => l.conceptIds)).size;
}

function Steps({ state }: { state: BuildState }) {
  return (
    <section className="gx-steps gx-card" aria-label="Building your run" aria-live="polite">
      {state.steps.map((s) => (
        <div key={s.id} className="gx-step" data-status={s.status}>
          <span className="gx-step-dot" aria-hidden="true">
            {s.status === "done" ? <Check size={18} strokeWidth={3} /> : s.status === "active" ? <span className="gx-spin" /> : null}
          </span>
          <div>
            <b>{s.label}</b>
            <small>{s.detail ?? (s.status === "active" ? "Working" : s.status === "done" ? "Done" : "Waiting")}</small>
          </div>
        </div>
      ))}
      {state.lines.length ? (
        <div className="gx-lines gx-note" aria-hidden="true">
          {state.lines.slice(-3).map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
        </div>
      ) : null}
    </section>
  );
}

export function BuildScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("files");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<BuildState | null>(null);
  const started = useRef(false);

  const land = useCallback(
    (run: Run, base: BuildState) => {
      setState(applyRun(base, run.size, distinctConcepts(run), run.worlds.length));
      setTimeout(() => router.push(`/run/${encodeURIComponent(run.id)}`), HOLD_MS);
    },
    [router]
  );

  const fail = useCallback((message: string) => {
    setError(message);
    setBusy(false);
  }, []);

  const runSample = useCallback(async () => {
    setError(null);
    setBusy(true);
    let st = applyMessage(initialBuild(), { line: "Opening the sample notes" });
    setState(st);
    try {
      writeStoredCourse(SAMPLE_COURSE_ID);
      const run = await fetchRun(SAMPLE_COURSE_ID);
      st = applyMessage(st, { line: "Finding the ideas in it" });
      land(run, st);
    } catch (e) {
      fail(e instanceof Error ? e.message : "The sample run could not be built.");
      setState(null);
    }
  }, [fail, land]);

  const buildFromNotes = useCallback(async () => {
    const problem = validateIntake(tab === "files" ? "files" : "paste", { text, files });
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    let st = initialBuild();
    setState(st);
    try {
      let body: BodyInit;
      const headers: Record<string, string> = {};
      if (tab === "files") {
        const form = new FormData();
        files.forEach((f) => form.append("file", f));
        if (title.trim()) form.set("title", title.trim());
        body = form;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ kind: "paste", title: title.trim() || "Your notes", text });
      }
      const res = await fetch("/api/subjects/create", { method: "POST", headers, body });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        setState(null);
        return fail(buildErrorCopy(data?.error?.code, data?.error?.message));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let subjectId: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjson(buffer);
        buffer = parsed.rest;
        for (const msg of parsed.messages as Msg[]) {
          if (msg.error) {
            setState(null);
            return fail(buildErrorCopy(msg.error.code, msg.error.message));
          }
          // The whole subject travels back with the reply; keep it before anything navigates.
          if (msg.record) rememberSubject(msg.record);
          if (msg.subject) subjectId = msg.subject.id;
          st = applyMessage(st, msg);
          setState(st);
        }
      }
      if (!subjectId) {
        setState(null);
        return fail("The build ended before the material was read. Nothing was saved. Try again.");
      }
      writeStoredCourse(subjectId);
      land(await fetchRun(subjectId), st);
    } catch (e) {
      setState(null);
      fail(e instanceof Error && e.message ? e.message : "The connection dropped while Aloud was reading. Nothing was saved. Try again.");
    }
  }, [tab, text, files, title, fail, land]);

  useEffect(() => {
    if (params.get("sample") === "1" && !started.current) {
      started.current = true;
      void runSample();
    }
  }, [params, runSample]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    setFiles(Array.from(e.dataTransfer.files));
    setTab("files");
  };

  if (state) {
    return (
      <div className="gx-build gx-wrap">
        <div>
          <p className="gx-eyebrow">Building your run</p>
          <h1 className="gx-h1">{state.finished && !state.error ? "Your run is ready" : "Reading your notes"}</h1>
        </div>
        <Steps state={state} />
        {state.finished && !state.error ? <p className="gx-lede" role="status">Opening the map.</p> : null}
        {error ? <ErrorState title="That did not build" body={error} /> : null}
      </div>
    );
  }

  return (
    <div className="gx-build gx-wrap">
      <div style={{ display: "grid", gap: 10 }}>
        <p className="gx-eyebrow">Build a run</p>
        <h1 className="gx-h1">Drop your notes. Play it out loud.</h1>
        <p className="gx-lede">Aloud reads your pages and builds 12 to 30 levels from them. Every question and every claim comes from your own material.</p>
      </div>

      <div className="gx-tabs" role="tablist" aria-label="How to add your notes">
        <button type="button" role="tab" aria-selected={tab === "files"} onClick={() => setTab("files")}>Upload a file</button>
        <button type="button" role="tab" aria-selected={tab === "paste"} onClick={() => setTab("paste")}>Paste text</button>
      </div>

      {tab === "files" ? (
        <label
          className="gx-drop"
          data-over={over}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <span className="gx-empty-art" aria-hidden="true"><Upload size={40} strokeWidth={1.6} /></span>
          <b className="gx-h2">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} chosen` : "Drop a PDF or a text file here"}</b>
          <span className="gx-note">PDF, Word or plain text, up to 4 files and 4 MB together. A scanned PDF has no text in it, so paste the words instead.</span>
          {files.length ? <span className="gx-chip"><FileText size={14} aria-hidden="true" />{files.map((f) => f.name).join(", ")}</span> : null}
          <input
            type="file"
            multiple
            aria-label="Choose a file"
            accept=".pdf,.txt,.md,.markdown,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
      ) : (
        <label style={{ display: "grid", gap: 8 }}>
          <span className="gx-eyebrow">Your notes</span>
          <textarea className="gx-field" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a lecture, a chapter or your own writing." />
          <span className="gx-note gx-mono">{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
        </label>
      )}

      <label style={{ display: "grid", gap: 8 }}>
        <span className="gx-eyebrow">Name it (optional)</span>
        <input className="gx-field" style={{ minHeight: 52 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Krebs cycle, week 5" />
      </label>

      {error ? <ErrorState title="Check that and try again" body={error} /> : null}

      <div style={{ display: "grid", gap: 10 }}>
        <button type="button" className="gx-btn gx-btn--lg" disabled={busy} onClick={() => void buildFromNotes()}>Build my run</button>
        <button type="button" className="gx-btn gx-btn--ghost" disabled={busy} onClick={() => void runSample()}>
          <Sparkles size={18} aria-hidden="true" /> Use the sample instead
        </button>
        <p className="gx-note">The sample is a labelled set of course notes on transformers, written for Aloud. No upload needed.</p>
      </div>
    </div>
  );
}
