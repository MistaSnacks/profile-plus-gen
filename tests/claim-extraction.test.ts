import { describe, it, expect } from "vitest";
import {
  parseProposedClaims,
  admitClaims,
  extractClaimsFromDocument,
  type ProposedClaim,
} from "../supabase/functions/_shared/claim-extraction.ts";
import type { AiClient } from "../supabase/functions/_shared/ai-client.ts";

const DOC = "Built weekly fraud dashboards in Tableau. Wrote SQL queries against Snowflake to flag chargeback anomalies, reducing losses by 18% in 2023.";

const verifiedClaim = (over: Partial<ProposedClaim> = {}): ProposedClaim => ({
  kind: "verified",
  type: "skill",
  text: "Tableau dashboard development",
  labels: ["tableau"],
  quote: "Built weekly fraud dashboards in Tableau",
  ...over,
});

describe("parseProposedClaims", () => {
  it("accepts a well-formed claims payload", () => {
    const { valid, malformed } = parseProposedClaims({ claims: [verifiedClaim()] });
    expect(valid).toHaveLength(1);
    expect(malformed).toHaveLength(0);
  });

  it("rejects the payload when the top level is not {claims: []}", () => {
    expect(() => parseProposedClaims({ notClaims: true })).toThrow(/claims/);
  });

  it("collects malformed entries without dropping valid ones", () => {
    const { valid, malformed } = parseProposedClaims({
      claims: [verifiedClaim(), { kind: "verified" }, { kind: "wizard", type: "skill", text: "x", labels: [] }],
    });
    expect(valid).toHaveLength(1);
    expect(malformed).toHaveLength(2);
  });
});

describe("admitClaims", () => {
  it("admits a verified claim whose quote matches, with offsets", () => {
    const { admitted, rejected } = admitClaims([verifiedClaim()], DOC);
    expect(rejected).toHaveLength(0);
    expect(admitted).toHaveLength(1);
    const ev = admitted[0].evidence!;
    expect(DOC.slice(ev.start, ev.end)).toBe("Built weekly fraud dashboards in Tableau");
  });

  it("rejects a verified claim whose quote is not in the document", () => {
    const { admitted, rejected } = admitClaims(
      [verifiedClaim({ quote: "Certified Kubernetes administrator" })],
      DOC,
    );
    expect(admitted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/quote not found/i);
  });

  it("rejects a verified claim with no quote at all", () => {
    const { rejected } = admitClaims([verifiedClaim({ quote: undefined })], DOC);
    expect(rejected[0].reason).toMatch(/missing quote/i);
  });

  it("admits an inferred claim supported by admitted verified claims", () => {
    const inferred: ProposedClaim = {
      kind: "inferred",
      type: "skill",
      text: "Data visualization",
      labels: ["data-visualization"],
      supports: [0],
      reasoning: "Sustained Tableau dashboard work demonstrates data visualization.",
    };
    const { admitted, rejected } = admitClaims([verifiedClaim(), inferred], DOC);
    expect(rejected).toHaveLength(0);
    expect(admitted).toHaveLength(2);
    expect(admitted[1].supports).toEqual([0]);
  });

  it("rejects an inferred claim whose support index points at a rejected claim", () => {
    const inferred: ProposedClaim = {
      kind: "inferred",
      type: "skill",
      text: "Container orchestration",
      labels: [],
      supports: [0],
      reasoning: "…",
    };
    const bogus = verifiedClaim({ quote: "Deployed Kubernetes clusters" });
    const { admitted, rejected } = admitClaims([bogus, inferred], DOC);
    expect(admitted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[1].reason).toMatch(/support/i);
  });

  it("rejects an inferred claim with no supports", () => {
    const inferred: ProposedClaim = {
      kind: "inferred", type: "skill", text: "Leadership", labels: [], supports: [], reasoning: "…",
    };
    const { rejected } = admitClaims([inferred], DOC);
    expect(rejected[0].reason).toMatch(/support/i);
  });
});

describe("extractClaimsFromDocument", () => {
  it("runs propose → parse → admit end to end with a fake AI", async () => {
    const fakeAi: AiClient = {
      chatJson: async () => ({
        claims: [
          verifiedClaim(),
          { kind: "verified", type: "achievement", text: "Fabricated award", labels: [], quote: "Employee of the Year" },
        ],
      }),
    };
    const result = await extractClaimsFromDocument(DOC, fakeAi);
    expect(result.admitted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.malformedCount).toBe(0);
  });
});
