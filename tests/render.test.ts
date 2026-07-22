import { describe, it, expect } from "vitest";
import {
  buildRenderPrompt,
  admitBullets,
  renderPlainText,
} from "../supabase/functions/_shared/render.ts";

const SELECTED = ["c-1", "c-2"];

const bullet = (over: Record<string, unknown> = {}) => ({
  section: "Experience",
  text: "Built weekly fraud dashboards in Tableau for the risk leadership team.",
  claim_ids: ["c-1"],
  ...over,
});

describe("buildRenderPrompt", () => {
  it("lists the claim ids the model is allowed to cite", () => {
    const { system, user } = buildRenderPrompt(
      [{ text: "Tableau experience", type: "skill", priority: "required" }],
      [{ id: "c-1", kind: "verified", type: "skill", text: "Tableau dashboards" }],
    );
    expect(user).toContain("c-1");
    expect(system).toContain("claim_ids");
  });
});

describe("admitBullets", () => {
  it("admits a bullet citing a selected claim", () => {
    const result = admitBullets({ bullets: [bullet()] }, SELECTED);
    expect(result.admitted).toHaveLength(1);
    expect(result.admitted[0].claimIds).toEqual(["c-1"]);
    expect(result.admitted[0].position).toBe(0);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a bullet that cites nothing", () => {
    const result = admitBullets({ bullets: [bullet({ claim_ids: [] })] }, SELECTED);
    expect(result.admitted).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/cites no claim/i);
  });

  it("rejects a bullet citing a claim outside the selected set", () => {
    const result = admitBullets({ bullets: [bullet({ claim_ids: ["c-1", "c-outside"] })] }, SELECTED);
    expect(result.admitted).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/not in the selected set/i);
  });

  it("counts malformed entries without dropping valid ones", () => {
    const result = admitBullets(
      { bullets: [bullet(), "nope", bullet({ text: "  " }), bullet({ section: "" })] },
      SELECTED,
    );
    expect(result.admitted).toHaveLength(1);
    expect(result.malformed).toBe(3);
  });

  it("numbers positions per section", () => {
    const result = admitBullets(
      {
        bullets: [
          bullet({ section: "Experience", text: "First." }),
          bullet({ section: "Skills", text: "Second." }),
          bullet({ section: "Experience", text: "Third." }),
        ],
      },
      SELECTED,
    );
    const positions = result.admitted.map((b) => `${b.section}:${b.position}`);
    expect(positions).toEqual(["Experience:0", "Skills:0", "Experience:1"]);
  });

  it("throws when the payload has no bullets array", () => {
    expect(() => admitBullets({ sections: [] }, SELECTED)).toThrow(/bullets/);
  });
});

describe("renderPlainText", () => {
  it("groups bullets under their section headings in position order", () => {
    const result = admitBullets(
      {
        bullets: [
          bullet({ section: "Experience", text: "First." }),
          bullet({ section: "Skills", text: "A skill." }),
          bullet({ section: "Experience", text: "Second." }),
        ],
      },
      SELECTED,
    );
    const text = renderPlainText(result.admitted);
    expect(text).toBe("EXPERIENCE\n- First.\n- Second.\n\nSKILLS\n- A skill.");
  });

  it("returns an empty string for no bullets", () => {
    expect(renderPlainText([])).toBe("");
  });
});
