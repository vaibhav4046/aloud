import { describe, expect, it } from "vitest";
import { highlightParts } from "../src/components/game/highlight";
import { applyMessage, applyRun, buildErrorCopy, initialBuild, parseNdjson, validateIntake } from "../src/components/game/build-model";
import { conceptMastery, prettyId, streakCalendar } from "../src/components/game/profile-model";
import { DEFAULT_SETTINGS, parseSettings } from "../src/components/game/settings";
import { follow } from "../src/components/game/VoiceOrb";
import { fixtureProgress, fixtureRun, won } from "./game-fixture";

describe("proof quote highlighting", () => {
  it("marks each matched span and leaves the rest plain", () => {
    const parts = highlightParts("Attention weights sum to one across the keys.", ["sum to one", "keys"]);
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["sum to one", "keys"]);
    expect(parts.map((p) => p.text).join("")).toBe("Attention weights sum to one across the keys.");
  });

  it("matches without regard to case and merges overlapping spans", () => {
    const parts = highlightParts("Softmax turns scores into weights.", ["SOFTMAX turns", "turns scores"]);
    expect(parts).toEqual([
      { text: "Softmax turns scores", hit: true },
      { text: " into weights.", hit: false },
    ]);
  });

  it("highlights the whole quote when no span is usable, since the whole quote was matched by code", () => {
    expect(highlightParts("A verbatim line.", [])).toEqual([{ text: "A verbatim line.", hit: true }]);
    expect(highlightParts("A verbatim line.", ["not in the quote"])).toEqual([{ text: "A verbatim line.", hit: true }]);
    expect(highlightParts("", ["x"])).toEqual([]);
  });
});

describe("build steps follow the real stream", () => {
  it("activates a step only after the line that starts it arrived", () => {
    let s = initialBuild();
    expect(s.steps.every((x) => x.status === "pending")).toBe(true);
    s = applyMessage(s, { line: "Reading your notes…" });
    expect(s.steps.map((x) => x.status)).toEqual(["active", "pending", "pending"]);
    s = applyMessage(s, { line: "Finding the ideas in it…" });
    expect(s.steps.map((x) => x.status)).toEqual(["done", "active", "pending"]);
  });

  it("shows counts only once a message carried them", () => {
    let s = applyMessage(initialBuild(), { line: "Reading your notes…" });
    expect(s.steps[1].detail).toBeNull();
    s = applyMessage(s, { subject: { id: "s", title: "T", concepts: 9, questions: 7, passages: 12 } });
    expect(s.steps[0].detail).toBe("12 passages");
    expect(s.steps[1].detail).toBe("9 concepts found");
    expect(s.steps[2].status).toBe("active");
    expect(s.finished).toBe(false);
    s = applyRun(s, 18, 9, 4);
    expect(s.steps[2]).toMatchObject({ status: "done", detail: "18 levels in 4 worlds" });
    expect(s.finished).toBe(true);
  });

  it("a finished step never goes backwards and an error ends the build", () => {
    let s = applyMessage(initialBuild(), { line: "Finding the ideas in it…" });
    s = applyMessage(s, { line: "Reading your sources…" });
    expect(s.steps[0].status).toBe("done");
    s = applyMessage(s, { error: { code: "NO_TEXT_IN_FILE", message: "x" } });
    expect(s.error).toBe("x");
    expect(s.finished).toBe(true);
  });

  it("splits a growing NDJSON buffer into whole messages and keeps the tail", () => {
    const p = parseNdjson('{"line":"a"}\n{"line":"b"}\n{"line":"par');
    expect(p.messages.map((m) => m.line)).toEqual(["a", "b"]);
    expect(p.rest).toBe('{"line":"par');
    expect(parseNdjson("not json\n{\"line\":\"ok\"}\n").messages).toHaveLength(1);
  });

  it("phrases refusals and checks the intake before the upload", () => {
    expect(buildErrorCopy("NO_TEXT_IN_FILE", undefined)).toMatch(/Paste the text/);
    expect(buildErrorCopy("WHATEVER", "server words")).toBe("server words");
    expect(validateIntake("paste", { text: "short" })).toMatch(/Paste a bit more/);
    expect(validateIntake("paste", { text: "x".repeat(300) })).toBeNull();
    expect(validateIntake("files", { files: [] })).toMatch(/Choose a file/);
    expect(validateIntake("files", { files: [{ size: 5 * 1024 * 1024 }] })).toMatch(/4 MB/);
    expect(validateIntake("files", { files: Array.from({ length: 5 }, () => ({ size: 1 })) })).toMatch(/up to 4/);
  });
});

describe("profile models", () => {
  it("marks the streak days ending at the last day played and covers whole weeks", () => {
    const now = new Date(2026, 8, 30, 12);
    const cells = streakCalendar({ streakDays: 3, lastPlayedDay: "2026-09-30" }, now, 5);
    expect(cells).toHaveLength(35);
    expect(cells.filter((c) => c.played).map((c) => c.day)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(cells.find((c) => c.today)?.day).toBe("2026-09-30");
    expect(cells[0].weekday).toBe(0);
    expect(cells.filter((c) => c.future).length).toBeGreaterThan(0);
  });

  it("shows no played days for a zero streak", () => {
    expect(streakCalendar({ streakDays: 0, lastPlayedDay: null }, new Date(2026, 8, 30)).some((c) => c.played)).toBe(false);
  });

  it("averages best stars per concept and lists weak concepts first", () => {
    const run = fixtureRun();
    const p = fixtureProgress({ results: { lv_1: won("lv_1", 3), lv_6: won("lv_6", 1) }, weakConceptIds: ["c3"] });
    const rows = conceptMastery(run, p, { c1: "Attention" });
    expect(rows[0].conceptId).toBe("c3");
    expect(rows[0].weak).toBe(true);
    const c1 = rows.find((r) => r.conceptId === "c1");
    expect(c1?.name).toBe("Attention");
    expect(c1?.stars).toBeGreaterThanOrEqual(3);
    expect(rows.find((r) => r.conceptId === "c2")?.name).toBe("C2");
    expect(prettyId("concept_positional_encoding")).toBe("Positional encoding");
  });
});

describe("settings and orb helpers", () => {
  it("sound is off by default and a corrupt value falls back to the defaults", () => {
    expect(DEFAULT_SETTINGS.sound).toBe(false);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"sound":"yes","typedOnly":true}')).toEqual({ sound: false, reduceMotion: false, typedOnly: true });
  });

  it("the orb rises quickly and falls slowly toward the real level", () => {
    expect(follow(0, 1)).toBeGreaterThan(0.5);
    expect(follow(1, 0)).toBeGreaterThan(0.8);
    expect(follow(0.5, 0.5)).toBe(0.5);
  });
});
