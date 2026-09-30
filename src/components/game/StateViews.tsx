"use client";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { Keyboard, MicOff, Upload, WifiOff } from "lucide-react";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Shown across the top while the browser reports no connection. Play continues in typed mode where it can. */
export function OfflineBanner({ kept = false }: { kept?: boolean }) {
  const online = useOnline();
  if (online && !kept) return null;
  return (
    <div className="gx-banner-offline" role="status">
      <WifiOff size={16} aria-hidden="true" />
      {online
        ? "The server did not answer, so this is the copy of your run saved on this device. Progress syncs when it is back."
        : "You look offline. Your progress is kept on this device and syncs when you are back."}
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="gx-wrap" role="status" aria-busy="true" aria-label="Loading your run" style={{ display: "grid", gap: 16, paddingBlock: 24 }}>
      <div className="gx-skel" style={{ height: 84 }} />
      <div className="gx-skel" style={{ height: 120 }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="gx-skel" style={{ height: 72, width: 72, borderRadius: 999, marginLeft: `${20 + ((i * 37) % 50)}%` }} />
      ))}
    </div>
  );
}

export function PlaySkeleton() {
  return (
    <div className="gx-wrap" role="status" aria-busy="true" aria-label="Loading the level" style={{ display: "grid", gap: 16, paddingBlock: 24 }}>
      <div className="gx-skel" style={{ height: 44 }} />
      <div className="gx-skel" style={{ height: 200 }} />
      <div className="gx-skel" style={{ height: 180, width: 180, borderRadius: 999, justifySelf: "center" }} />
    </div>
  );
}

export function ErrorState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="gx-state gx-card gx-state--bad" role="alert">
      <h2 className="gx-h2">{title}</h2>
      <p className="gx-lede">{body}</p>
      {action}
    </div>
  );
}

export function EmptyRun() {
  return (
    <div className="gx-state gx-card">
      <span className="gx-empty-art" aria-hidden="true"><Upload size={40} strokeWidth={1.6} /></span>
      <h2 className="gx-h2">No run yet</h2>
      <p className="gx-lede">Drop your notes and Aloud turns them into a run of levels you play by talking. The sample run works without an upload.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="gx-btn" href="/run/new">Build a run</Link>
        <Link className="gx-btn gx-btn--ghost" href="/run/new?sample=1">Use the sample</Link>
      </div>
    </div>
  );
}

/** The microphone did not open. Say why, say what still works, and offer both ways forward. */
export function MicDenied({ reason, onRetry, onTyped }: { reason: string; onRetry: () => void; onTyped: () => void }) {
  return (
    <div className="gx-state gx-card" role="alert">
      <span className="gx-empty-art" aria-hidden="true"><MicOff size={40} strokeWidth={1.6} /></span>
      <h2 className="gx-h2">Voice is not available</h2>
      <p className="gx-lede">{reason}</p>
      <p className="gx-note">Typed play scores the same as voice. The same examiner grades your answer against the same pages.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="gx-btn" onClick={onTyped}><Keyboard size={18} aria-hidden="true" /> Play by typing</button>
        <button type="button" className="gx-btn gx-btn--ghost" onClick={onRetry}>Try the microphone again</button>
      </div>
    </div>
  );
}
