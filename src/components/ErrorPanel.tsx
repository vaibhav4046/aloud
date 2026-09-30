import type { ReactNode } from "react";

/**
 * The screen a player sees when something throws. It says what happened, keeps
 * their work out of the blame ("your run and your progress are saved on this
 * device"), and gives two ways forward. A plain anchor for the way back, not
 * next/link: global-error renders without the router.
 */
export function ErrorPanel({ onRetry, digest, where = "this screen", children }: { onRetry: () => void; digest?: string; where?: string; children?: ReactNode }) {
  return (
    <section className="surface-card mx-auto mt-6 max-w-xl p-6 sm:p-8" role="alert">
      <p className="eyebrow">Something broke</p>
      <h1 className="heading mt-2 text-2xl">{`Could not load ${where}.`}</h1>
      <p className="prose-measure mt-3 text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
        Your run, your notes and your proofs are saved on this device and were not touched. Try again first. If it breaks the same way, go back to your run and open it from there.
      </p>
      {children}
      {digest ? (
        <p className="eyebrow mt-4" style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
          Reference {digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={onRetry}>
          Try again
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/run" className="btn-ghost">
          Back to your run
        </a>
      </div>
    </section>
  );
}
