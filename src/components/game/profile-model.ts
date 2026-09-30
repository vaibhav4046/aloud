import type { Progress, Run } from "@/lib/game/types";
/** Local calendar day of a Date as YYYY-MM-DD, the shape Progress.lastPlayedDay uses. */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Pure models for the profile screen: the streak calendar and per-concept mastery. */

export type CalendarCell = { day: string; played: boolean; today: boolean; future: boolean; weekday: number };

function addDays(d: Date, n: number): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return c;
}

/**
 * The last `weeks` weeks ending this week, Monday first. A day counts as played
 * when it falls inside the current streak, which runs back from the last day a
 * level was finished. Days a freeze covered sit inside that span and show as
 * played, which is what a freeze is for.
 */
export function streakCalendar(p: Pick<Progress, "streakDays" | "lastPlayedDay">, now: Date, weeks = 5): CalendarCell[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - (weeks - 1) * 7);
  const played = new Set<string>();
  if (p.lastPlayedDay && p.streakDays > 0) {
    const [y, m, d] = p.lastPlayedDay.split("-").map(Number);
    const last = new Date(y, m - 1, d);
    for (let i = 0; i < p.streakDays; i++) played.add(localDay(addDays(last, -i)));
  }
  const todayKey = localDay(today);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    const key = localDay(date);
    cells.push({ day: key, played: played.has(key), today: key === todayKey, future: date > today, weekday: i % 7 });
  }
  return cells;
}

export type ConceptRow = { conceptId: string; name: string; fraction: number; stars: number; levels: number; weak: boolean };

/**
 * Mastery per concept: the best stars the player has on each level that covers
 * it, averaged over those levels, out of 3. A concept with no cleared level is
 * 0. Weak concepts (missed and not yet redeemed) are flagged.
 */
export function conceptMastery(run: Run, progress: Progress, names: Record<string, string>): ConceptRow[] {
  const by = new Map<string, { stars: number; levels: number }>();
  for (const level of run.levels) {
    if (level.kind === "recall") continue;
    const r = progress.results[level.id];
    const best = r && r.outcome === "won" ? r.stars : 0;
    for (const id of level.conceptIds) {
      const cur = by.get(id) ?? { stars: 0, levels: 0 };
      by.set(id, { stars: cur.stars + best, levels: cur.levels + 1 });
    }
  }
  const weak = new Set(progress.weakConceptIds);
  return [...by.entries()]
    .map(([conceptId, v]) => ({
      conceptId,
      name: names[conceptId] ?? prettyId(conceptId),
      fraction: v.levels ? v.stars / (3 * v.levels) : 0,
      stars: v.stars,
      levels: v.levels,
      weak: weak.has(conceptId),
    }))
    .sort((a, b) => Number(b.weak) - Number(a.weak) || a.fraction - b.fraction || a.name.localeCompare(b.name));
}

export function prettyId(id: string): string {
  const words = id.replace(/^(c|concept)[_-]/i, "").replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

export const GOAL_CHOICES = [5, 10, 15, 20, 30] as const;
