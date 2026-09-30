import type { Level, LevelKind, Progress, Run, World } from "@/lib/game/types";
import { dailyGoalFraction, streakStatus, type Ctx } from "@/lib/game/progress";

/**
 * Pure screen model for the run map. Everything the map draws is derived here
 * from a Run and the player's Progress, so node states, the winding path and
 * the world bars can be asserted without a browser.
 */

export type NodeState = "locked" | "current" | "open" | "done";

export type MapNode = {
  level: Level;
  state: NodeState;
  stars: 0 | 1 | 2 | 3;
  /** Horizontal centre in percent of the map width. */
  x: number;
  /** Vertical centre in px from the top of the map. */
  y: number;
};

export type MapBanner = { world: World; y: number; summary: WorldSummary };

export type MapLayout = {
  height: number;
  nodes: MapNode[];
  banners: MapBanner[];
  /** SVG path data in a 0..100 wide, `height` tall box. */
  pathDone: string;
  pathTodo: string;
  currentId: string | null;
};

export type WorldSummary = {
  done: number;
  total: number;
  /** 0..1, the true fraction of levels won in this world. */
  fraction: number;
  toGo: number;
  /** The last third of a world: the bar switches to its "nearly there" look. */
  nearEnd: boolean;
  /** The boss is the last level in the world. */
  bossOpen: boolean;
  copy: string;
};

export const ROW_H = 118;
export const BANNER_H = 148;
export const TOP_PAD = 36;
export const BOTTOM_PAD = 120;
/** The path swings this far either side of the centre line, in percent of width. */
const SWING = 27;

export function isWon(progress: Progress, levelId: string): boolean {
  const r = progress.results[levelId];
  return !!r && r.outcome === "won" && r.stars >= 1;
}

export function starsOf(progress: Progress, levelId: string): 0 | 1 | 2 | 3 {
  const r = progress.results[levelId];
  return r && r.outcome === "won" ? r.stars : 0;
}

/** The level the player continues to: the first unlocked level without a win. */
export function currentLevel(run: Run, progress: Progress): Level | null {
  for (const level of run.levels) {
    if (level.index > progress.unlockedIndex) break;
    if (!isWon(progress, level.id)) return level;
  }
  return null;
}

export function nodeState(level: Level, run: Run, progress: Progress): NodeState {
  if (isWon(progress, level.id)) return "done";
  if (level.index > progress.unlockedIndex) return "locked";
  const cur = currentLevel(run, progress);
  return cur && cur.id === level.id ? "current" : "open";
}

export function worldSummary(world: World, run: Run, progress: Progress): WorldSummary {
  const total = world.levelIds.length;
  const done = world.levelIds.filter((id) => isWon(progress, id)).length;
  const toGo = total - done;
  const fraction = total === 0 ? 0 : done / total;
  const lastId = world.levelIds[total - 1];
  const last = run.levels.find((l) => l.id === lastId);
  const bossOpen = !!last && last.kind === "boss" && done === total - 1;
  let copy: string;
  if (toGo === 0) copy = "World cleared";
  else if (bossOpen) copy = "The boss is open";
  else if (toGo === 1) copy = "One level to go";
  else if (fraction >= 0.6) copy = `${toGo} to go`;
  else if (done === 0) copy = `${total} levels`;
  else copy = `${done} of ${total}`;
  return { done, total, fraction, toGo, nearEnd: fraction >= 0.6 && toGo > 0, bossOpen, copy };
}

/** Where a node sits across the map. Bosses stand in the centre. */
export function nodeX(level: Level, i: number): number {
  if (level.kind === "boss") return 50;
  return 50 + SWING * Math.sin(i * 1.05 + 0.4);
}

/** A cubic that leaves and arrives vertically, so consecutive nodes read as one road. */
function segment(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const my = (a.y + b.y) / 2;
  return `C ${a.x.toFixed(2)} ${my.toFixed(1)}, ${b.x.toFixed(2)} ${my.toFixed(1)}, ${b.x.toFixed(2)} ${b.y.toFixed(1)}`;
}

export function layoutMap(run: Run, progress: Progress): MapLayout {
  const nodes: MapNode[] = [];
  const banners: MapBanner[] = [];
  let y = TOP_PAD;
  let i = 0;
  for (const world of run.worlds) {
    banners.push({ world, y: y + BANNER_H / 2, summary: worldSummary(world, run, progress) });
    y += BANNER_H;
    for (const id of world.levelIds) {
      const level = run.levels.find((l) => l.id === id);
      if (!level) continue;
      nodes.push({
        level,
        state: nodeState(level, run, progress),
        stars: starsOf(progress, level.id),
        x: nodeX(level, i),
        y: y + ROW_H / 2,
      });
      y += ROW_H;
      i += 1;
    }
  }
  const height = y + BOTTOM_PAD;
  const cur = currentLevel(run, progress);
  const curIdx = cur ? nodes.findIndex((n) => n.level.id === cur.id) : nodes.length - 1;
  const build = (from: number, to: number): string => {
    if (to <= from || !nodes[from]) return "";
    let d = `M ${nodes[from].x.toFixed(2)} ${nodes[from].y.toFixed(1)}`;
    for (let k = from + 1; k <= to && k < nodes.length; k++) d += ` ${segment(nodes[k - 1], nodes[k])}`;
    return d;
  };
  return {
    height,
    nodes,
    banners,
    pathDone: build(0, Math.max(0, curIdx)),
    pathTodo: build(Math.max(0, curIdx), nodes.length - 1),
    currentId: cur ? cur.id : null,
  };
}

/* ------------------------------ status rail ------------------------------ */

export type DailyRing = { fraction: number; minutes: number; shown: string; goal: number; met: boolean; copy: string };

/** Minutes for display: one decimal, rounded down so a goal never reads as met early, and no trailing ".0". */
export function formatMinutes(minutes: number): string {
  const tenths = Math.floor(Math.max(0, minutes) * 10 + 1e-9) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}

/** The daily-goal ring. Minutes from an earlier day count for nothing today: the engine returns 0 then. */
export function dailyRing(progress: Progress, ctx: Ctx): DailyRing {
  const goal = Math.max(1, progress.dailyGoalMinutes);
  const fraction = dailyGoalFraction(progress, ctx);
  const minutes = fraction * goal;
  const met = fraction >= 1;
  const shown = formatMinutes(minutes);
  return { fraction, minutes, shown, goal, met, copy: met ? "Goal met" : `${shown} of ${goal} min` };
}

export type Flame = { days: number; lit: boolean; freezes: number; state: "none" | "safe" | "at_risk" | "broken"; copy: string; freezeCopy: string };

/** The flame. A broken streak shows 0 and no guilt: the copy says how to start again. */
export function flameState(progress: Progress, ctx: Ctx): Flame {
  const s = streakStatus(progress, ctx);
  const freezes = progress.freezes;
  const copy =
    s.state === "none" || s.state === "broken"
      ? "Start a streak"
      : s.state === "safe"
        ? `${s.days} day streak`
        : `${s.days} day streak, play today to extend it`;
  const freezeCopy = freezes > 0 ? `${freezes} freeze${freezes === 1 ? "" : "s"} banked` : "No freeze banked. One is earned every 7 days";
  return { days: s.days, lit: s.playedToday, freezes, state: s.state, copy, freezeCopy };
}

export const KIND_LABEL: Record<LevelKind, string> = {
  say: "Say it",
  catch: "Catch it",
  boss: "Boss",
  recall: "Recall",
};

/** A node's accessible name, in one sentence a screen reader can read in one go. */
export function nodeLabel(n: MapNode): string {
  const kind = KIND_LABEL[n.level.kind];
  const base = `Level ${n.level.index}, ${kind}: ${n.level.title}`;
  switch (n.state) {
    case "locked": return `${base}. Locked. Win the level before it to open this one.`;
    case "done": return `${base}. ${n.stars} of 3 stars. Replay for more stars.`;
    case "current": return `${base}. Next up.`;
    default: return `${base}. Open.`;
  }
}
