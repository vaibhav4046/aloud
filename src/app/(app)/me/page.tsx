"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { lastRunId, useRunData } from "@/components/game/useRunData";
import { Stage } from "@/components/game/Stage";
import { StatusRail } from "@/components/game/StatusRail";
import { EmptyRun, ErrorState, MapSkeleton } from "@/components/game/StateViews";
import { conceptMastery, GOAL_CHOICES, streakCalendar } from "@/components/game/profile-model";
import { useSettings } from "@/components/game/settings";
import { subjectIdOfRun } from "@/components/game/game-client";
import type { Progress, Run } from "@/lib/game/types";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="gx-switch">
      <label htmlFor={id}>
        <span>{label}</span>
        <span className="gx-note">{hint}</span>
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} className="gx-toggle" onClick={() => onChange(!checked)} />
    </div>
  );
}

function Settings({ progress, onGoal }: { progress: Progress | null; onGoal: (m: number) => void }) {
  const [s, set] = useSettings();
  return (
    <section className="gx-card" style={{ padding: "8px 22px" }} aria-labelledby="gx-settings">
      <h2 id="gx-settings" className="gx-h2" style={{ padding: "16px 0 4px" }}>Settings</h2>
      <Toggle id="set-sound" label="Sound" hint="Short cues on answers. Off until you turn it on." checked={s.sound} onChange={(v) => set({ sound: v })} />
      <Toggle id="set-motion" label="Reduce motion" hint="Stills the animations. Everything still works." checked={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
      <Toggle id="set-typed" label="Typed only" hint="Never asks for the microphone. Scores the same as voice." checked={s.typedOnly} onChange={(v) => set({ typedOnly: v })} />
      {progress ? (
        <div className="gx-switch">
          <label htmlFor="set-goal">
            <span>Daily goal</span>
            <span className="gx-note">Minutes of play that fill the ring.</span>
          </label>
          <select id="set-goal" className="gx-field" style={{ width: "auto", minHeight: 48, padding: "0 14px" }} value={progress.dailyGoalMinutes} onChange={(e) => onGoal(Number(e.target.value))}>
            {GOAL_CHOICES.map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      ) : null}
    </section>
  );
}

function Profile({ run, progress, commit }: { run: Run; progress: Progress; commit: (p: Progress) => void }) {
  const now = useMemo(() => new Date(), []);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void fetch(`/api/sources?subject=${encodeURIComponent(subjectIdOfRun(run.id))}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { concepts?: { id: string; name: string }[] } | null) => {
        if (live && b?.concepts) setNames(Object.fromEntries(b.concepts.map((c) => [c.id, c.name])));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [run.id]);

  const cal = streakCalendar(progress, now);
  const rows = conceptMastery(run, progress, names);
  return (
    <>
      <StatusRail progress={progress} now={now} />
      <section className="gx-card" style={{ padding: 22, display: "grid", gap: 14 }} aria-labelledby="gx-cal">
        <h2 id="gx-cal" className="gx-h2">Streak</h2>
        <div className="gx-cal" role="img" aria-label={`${progress.streakDays} day streak. ${progress.freezes} freezes banked.`}>
          {DAYS.map((d, i) => <b key={i} aria-hidden="true">{d}</b>)}
          {cal.map((c) => <i key={c.day} className={`${c.played ? "on" : ""}${c.today ? " today" : ""}`} style={c.future ? { opacity: 0.35 } : undefined} title={c.day} />)}
        </div>
        <p className="gx-note">A streak counts a day when you finish a level. One freeze is earned every 7 days and is spent by itself on a missed day.</p>
      </section>
      <section className="gx-card" style={{ padding: 22, display: "grid", gap: 14 }} aria-labelledby="gx-mastery">
        <h2 id="gx-mastery" className="gx-h2">Concept mastery</h2>
        <div className="gx-mastery">
          {rows.map((r) => (
            <div key={r.conceptId} className="gx-mastery-row">
              <span>{r.name}{r.weak ? " (to revisit)" : ""}</span>
              <b className="gx-mono">{r.stars}/{r.levels * 3}</b>
              <div className="gx-xpbar" role="progressbar" aria-label={`${r.name} mastery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.fraction * 100)}>
                <i style={{ transform: `scaleX(${r.fraction})` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="gx-note">Stars are the best you have on each level that covers the concept. Missed concepts come back as Recall levels.</p>
      </section>
      <Settings progress={progress} onGoal={(m) => commit({ ...progress, dailyGoalMinutes: m })} />
    </>
  );
}

export default function MePage() {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => setId(lastRunId()), []);
  const data = useRunData(id ?? "");

  return (
    <Stage>
      <div className="gx-wrap" style={{ display: "grid", gap: 16, paddingBlock: "28px 120px" }}>
        <div>
          <p className="gx-eyebrow">Profile</p>
          <h1 className="gx-h1">Your streak, rank and settings</h1>
        </div>
        {id === undefined ? <MapSkeleton /> : null}
        {id === null ? (
          <>
            <EmptyRun />
            <Settings progress={null} onGoal={() => undefined} />
          </>
        ) : null}
        {id ? (
          data.status === "loading" ? <MapSkeleton /> : data.status === "error" ? (
            <>
              <ErrorState title="Your run did not load" body={data.error.message} action={<button className="gx-btn" type="button" onClick={data.reload}>Try again</button>} />
              <Settings progress={null} onGoal={() => undefined} />
            </>
          ) : (
            <Profile run={data.run} progress={data.progress} commit={data.commit} />
          )
        ) : null}
        <p className="gx-note">Your progress is kept on this device. <Link className="link" href="/privacy">Privacy</Link></p>
      </div>
    </Stage>
  );
}
