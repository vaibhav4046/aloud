import { describe, expect, it } from "vitest";
import { crateEligible, rollCrate } from "@/components/game/result-model";

describe("crateEligible", () => {
  it("drops on a first clear and on more stars than before", () => {
    expect(crateEligible(0, { outcome: "won", stars: 1 })).toBe(true);
    expect(crateEligible(1, { outcome: "won", stars: 2 })).toBe(true);
    expect(crateEligible(2, { outcome: "won", stars: 3 })).toBe(true);
  });

  it("does not drop on a replay at the same or fewer stars, or on a level not won", () => {
    expect(crateEligible(2, { outcome: "won", stars: 2 })).toBe(false);
    expect(crateEligible(3, { outcome: "won", stars: 1 })).toBe(false);
    expect(crateEligible(0, { outcome: "lost", stars: 0 })).toBe(false);
    expect(crateEligible(0, { outcome: "quit", stars: 0 })).toBe(false);
  });

  it("a replay of a cleared level never rolls a crate, whatever the seed", () => {
    let rolled = 0;
    for (let i = 0; i < 200; i++) {
      const won = crateEligible(3, { outcome: "won", stars: 3 });
      if (rollCrate({ seed: `l1:${i}`, stars: 3, won, freezes: 0, facts: [] })) rolled += 1;
    }
    expect(rolled).toBe(0);
  });
});
