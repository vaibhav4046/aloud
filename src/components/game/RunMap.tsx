"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Crown, Lock, Mic, RotateCcw, ShieldQuestion, Star } from "lucide-react";
import type { Progress, Run } from "@/lib/game/types";
import { KIND_LABEL, layoutMap, nodeLabel, type MapNode } from "./map-model";
import { prefersReducedMotion, useSettings } from "./settings";

function KindIcon({ node }: { node: MapNode }) {
  const size = node.level.kind === "boss" ? 34 : 28;
  if (node.state === "locked") return <Lock size={size - 6} strokeWidth={2} />;
  if (node.state === "done" && node.level.kind !== "boss") return <Check size={size} strokeWidth={2.6} />;
  switch (node.level.kind) {
    case "boss": return <Crown size={size} strokeWidth={2} />;
    case "catch": return <ShieldQuestion size={size} strokeWidth={2} />;
    case "recall": return <RotateCcw size={size} strokeWidth={2.2} />;
    default: return <Mic size={size} strokeWidth={2} />;
  }
}

function Stars({ n }: { n: number }) {
  return (
    <span className="gx-stars" role="img" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={i < n ? "" : "off"} fill={i < n ? "currentColor" : "none"} strokeWidth={2} />
      ))}
    </span>
  );
}

function NodeView({ node, runId, onLocked }: { node: MapNode; runId: string; onLocked: (n: MapNode) => void }) {
  const { level, state } = node;
  const locked = state === "locked";
  const right = node.x < 50;
  const body = (
    <>
      <span className="gx-node-pulse" aria-hidden="true" />
      <span className="gx-node-pulse" aria-hidden="true" />
      <span className="gx-node-face" aria-hidden="true">
        <span className="gx-node-icon"><KindIcon node={node} /></span>
      </span>
    </>
  );
  const cls = `gx-node gx-node--${level.kind}`;
  return (
    <div className="gx-node-wrap" style={{ left: `${node.x}%`, top: node.y }} data-level-id={level.id} data-current={state === "current" || undefined}>
      {state === "current" ? <span className="gx-node-tag" aria-hidden="true">Next up</span> : null}
      {locked ? (
        <button type="button" className={cls} data-state={state} aria-disabled="true" aria-label={nodeLabel(node)} onClick={() => onLocked(node)}>
          {body}
        </button>
      ) : (
        <Link href={`/play/${encodeURIComponent(level.id)}?run=${encodeURIComponent(runId)}`} className={cls} data-state={state} aria-label={nodeLabel(node)}>
          {body}
        </Link>
      )}
      {node.stars > 0 ? <Stars n={node.stars} /> : state === "done" ? <Stars n={0} /> : null}
      {level.kind !== "boss" ? (
        <span className={`gx-blurb ${right ? "gx-blurb--r" : "gx-blurb--l"}`} aria-hidden={locked || undefined}>
          <small>{KIND_LABEL[level.kind]} {level.index}</small>
          {/* Curiosity gap: a locked level shows its blurb, blurred. */}
          <span className={locked ? "blur" : undefined}>{locked ? level.blurb : level.title}</span>
        </span>
      ) : null}
    </div>
  );
}

/** The winding road of levels, grouped in worlds, drawn from the run and the player's progress. */
export function RunMap({ run, progress }: { run: Run; progress: Progress }) {
  const layout = useMemo(() => layoutMap(run, progress), [run, progress]);
  const [settings] = useSettings();
  const [lockedMsg, setLockedMsg] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    if (scrolled.current || !layout.currentId) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-level-id="${CSS.escape(layout.currentId)}"]`);
    if (!el) return;
    scrolled.current = true;
    el.scrollIntoView({ block: "center", behavior: prefersReducedMotion(settings) ? "auto" : "smooth" });
  }, [layout.currentId, settings]);

  return (
    <div>
      <div ref={ref} className="gx-map" style={{ height: layout.height }} data-testid="run-map">
        <svg className="gx-map-svg" viewBox={`0 0 100 ${layout.height}`} preserveAspectRatio="none" aria-hidden="true">
          {layout.pathTodo ? <path className="gx-road-todo" d={layout.pathTodo} /> : null}
          {layout.pathDone ? <path className="gx-road-done" d={layout.pathDone} /> : null}
        </svg>

        {layout.banners.map((b) => {
          const s = b.summary;
          const cls = `gx-banner gx-card${s.nearEnd ? " gx-banner--near" : ""}${s.toGo === 0 ? " gx-banner--cleared" : ""}`;
          return (
            <section key={b.world.index} className={cls} style={{ top: b.y }} aria-label={`World ${b.world.index}: ${b.world.name}`}>
              <div className="gx-banner-top">
                <div>
                  <div className="gx-eyebrow">World {b.world.index}</div>
                  <h3>{b.world.name}</h3>
                </div>
                <span className="gx-banner-copy">{s.copy}</span>
              </div>
              <div className="gx-wbar" role="progressbar" aria-label={`World ${b.world.index} progress`} aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.done}>
                {b.world.levelIds.map((id, i) => (
                  <i key={id} className={i < s.done ? "on" : i === s.done ? "next" : ""} />
                ))}
              </div>
            </section>
          );
        })}

        {layout.nodes.map((n) => (
          <NodeView
            key={n.level.id}
            node={n}
            runId={run.id}
            onLocked={(node) => setLockedMsg(`Level ${node.level.index} is locked. Win level ${node.level.index - 1} to open it.`)}
          />
        ))}
      </div>
      <p className="gx-sr" role="status" aria-live="polite">{lockedMsg}</p>
    </div>
  );
}
