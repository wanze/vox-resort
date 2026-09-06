import { describe, expect, it } from "vitest";
import { spreadLabelAnchors, type LabelCandidate } from "./labelPlacement";

const at = (id: string, x: number, z: number, key = ""): LabelCandidate & { key: string } => ({
  id,
  x,
  z,
  key,
});

/** The smallest gap between any two chosen labels, as a squared distance. */
function closestPair(chosen: readonly LabelCandidate[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const a = chosen[i]!;
      const b = chosen[j]!;
      nearest = Math.min(nearest, (a.x - b.x) ** 2 + (a.z - b.z) ** 2);
    }
  }
  return nearest;
}

describe("spreadLabelAnchors", () => {
  it("labels nothing on an empty plot", () => {
    expect(spreadLabelAnchors([])).toEqual([]);
  });

  it("labels each type exactly once", () => {
    const chosen = spreadLabelAnchors([
      at("cottage", 0, 0),
      at("cottage", 50, 50),
      at("palm", 10, 10),
      at("cottage", 90, 0),
      at("palm", 90, 90),
    ]);
    expect(chosen.map((c) => c.id)).toEqual(["cottage", "palm"]);
  });

  it("keeps types in the order the plan first mentions them", () => {
    const chosen = spreadLabelAnchors([
      at("hotel", 0, 0),
      at("palm", 5, 5),
      at("villa", 9, 9),
      at("palm", 80, 80),
    ]);
    expect(chosen.map((c) => c.id)).toEqual(["hotel", "palm", "villa"]);
  });

  it("takes the only placement of a type it has no choice about", () => {
    const chosen = spreadLabelAnchors([at("fountain", 42, 36, "f")]);
    expect(chosen).toHaveLength(1);
    expect((chosen[0] as { key: string }).key).toBe("f");
  });

  it("pushes each label away from the ones already placed", () => {
    // Every type has a copy clustered at the origin and one out on the plot.
    // Taking the first of each would stack all four captions in one corner.
    const placements = [
      at("a", 0, 0, "a-near"),
      at("b", 1, 1, "b-near"),
      at("c", 2, 2, "c-near"),
      at("b", 100, 0, "b-far"),
      at("c", 0, 100, "c-far"),
    ];
    const chosen = spreadLabelAnchors(placements);
    expect(chosen.map((c) => (c as { key: string }).key)).toEqual(["a-near", "b-far", "c-far"]);
  });

  it("spreads a plan that introduces every type in one corner", () => {
    // Ten types, each with a copy in the north strip and a copy on its own
    // quarter of the plot — the shape the enlarged resort plan actually has.
    const placements: (LabelCandidate & { key: string })[] = [];
    for (let type = 0; type < 10; type++) {
      placements.push(at(`t${type}`, type * 4, 0, `t${type}-north`));
    }
    for (let type = 0; type < 10; type++) {
      placements.push(
        at(`t${type}`, (type % 5) * 200, Math.floor(type / 5) * 200 + 200, `t${type}-out`),
      );
    }
    const chosen = spreadLabelAnchors(placements);
    const naive = placements.slice(0, 10);
    expect(closestPair(chosen)).toBeGreaterThan(closestPair(naive));
  });

  it("is deterministic", () => {
    const placements = [
      at("a", 0, 0),
      at("b", 10, 0),
      at("b", 0, 10),
      at("c", 5, 5),
      at("c", 40, 40),
    ];
    expect(spreadLabelAnchors(placements)).toEqual(spreadLabelAnchors(placements));
  });
});
