import { describe, it, expect } from "vitest";
import {
  parseProposedClaims,
  admitClaims,
  extractClaimsFromDocument,
  type ProposedClaim,
  type IndexedClaim,
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

/** Wraps bare ProposedClaims with sequential ORIGINAL-array positions, as
 *  `parseProposedClaims` would when nothing is malformed. */
const withIndex = (claims: ProposedClaim[]): IndexedClaim[] =>
  claims.map((claim, index) => ({ claim, index }));

describe("parseProposedClaims", () => {
  it("accepts a well-formed claims payload", () => {
    const { valid, malformed } = parseProposedClaims({ claims: [verifiedClaim()] });
    expect(valid).toHaveLength(1);
    expect(valid[0].index).toBe(0);
    expect(valid[0].claim.text).toBe(verifiedClaim().text);
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

  it("preserves each valid claim's ORIGINAL position in the proposal array, not its position among valid entries", () => {
    const { valid } = parseProposedClaims({
      claims: [verifiedClaim(), { kind: "verified" }, verifiedClaim({ text: "second" })],
    });
    expect(valid).toHaveLength(2);
    expect(valid.map((v) => v.index)).toEqual([0, 2]);
  });
});

describe("admitClaims", () => {
  it("admits a verified claim whose quote matches, with offsets", () => {
    const { admitted, rejected } = admitClaims(withIndex([verifiedClaim()]), DOC);
    expect(rejected).toHaveLength(0);
    expect(admitted).toHaveLength(1);
    const ev = admitted[0].evidence!;
    expect(DOC.slice(ev.start, ev.end)).toBe("Built weekly fraud dashboards in Tableau");
  });

  it("rejects a verified claim whose quote is not in the document", () => {
    const { admitted, rejected } = admitClaims(
      withIndex([verifiedClaim({ quote: "Certified Kubernetes administrator" })]),
      DOC,
    );
    expect(admitted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/quote not found/i);
  });

  it("rejects a verified claim with no quote at all", () => {
    const { rejected } = admitClaims(withIndex([verifiedClaim({ quote: undefined })]), DOC);
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
    const { admitted, rejected } = admitClaims(withIndex([verifiedClaim(), inferred]), DOC);
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
    const { admitted, rejected } = admitClaims(withIndex([bogus, inferred]), DOC);
    expect(admitted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[1].reason).toMatch(/support/i);
  });

  it("rejects an inferred claim with no supports", () => {
    const inferred: ProposedClaim = {
      kind: "inferred", type: "skill", text: "Leadership", labels: [], supports: [], reasoning: "…",
    };
    const { rejected } = admitClaims(withIndex([inferred]), DOC);
    expect(rejected[0].reason).toMatch(/support/i);
  });

  it("resolves supports by ORIGINAL proposal-array position, not by position within the filtered array", () => {
    // Simulates parseProposedClaims having dropped a malformed entry at
    // original index 1: verified@0, (dropped)@1, inferred{supports:[0]}@2.
    const inferred: ProposedClaim = {
      kind: "inferred",
      type: "skill",
      text: "Data visualization",
      labels: ["data-visualization"],
      supports: [0],
      reasoning: "Sustained Tableau dashboard work demonstrates data visualization.",
    };
    const proposals: IndexedClaim[] = [
      { claim: verifiedClaim(), index: 0 },
      { claim: inferred, index: 2 },
    ];
    const { admitted, rejected } = admitClaims(proposals, DOC);
    expect(rejected).toHaveLength(0);
    expect(admitted).toHaveLength(2);
    const inferredAdmitted = admitted.find((c) => c.kind === "inferred");
    expect(inferredAdmitted?.index).toBe(2);
    expect(inferredAdmitted?.supports).toEqual([0]);
    const supportedClaim = admitted.find((c) => c.index === 0);
    expect(supportedClaim?.quote).toBe("Built weekly fraud dashboards in Tableau");
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

  // Regression: the model's `supports` indexes refer to positions in ITS OWN
  // output array (per the prompt), including malformed entries. Dropping
  // malformed entries before resolving `supports` desyncs the indexes.
  it("admits an inferred claim whose support survives despite an earlier malformed entry", async () => {
    const fakeAi: AiClient = {
      chatJson: async () => ({
        claims: [
          verifiedClaim(), // original index 0: "Built weekly fraud dashboards in Tableau"
          { kind: "verified" }, // original index 1: malformed, dropped
          verifiedClaim({
            text: "SQL against Snowflake",
            labels: ["sql"],
            quote: "Wrote SQL queries against Snowflake",
          }), // original index 2
          {
            kind: "inferred",
            type: "skill",
            text: "Data warehousing",
            labels: ["data-warehousing"],
            supports: [2], // refers to the Snowflake claim at ORIGINAL index 2
            reasoning: "Querying Snowflake demonstrates data warehousing skill.",
          }, // original index 3
        ],
      }),
    };
    const result = await extractClaimsFromDocument(DOC, fakeAi);
    expect(result.malformedCount).toBe(1);
    expect(result.rejected).toHaveLength(0);
    const inferred = result.admitted.find((c) => c.kind === "inferred");
    expect(inferred).toBeDefined();
    expect(inferred!.supports).toEqual([2]);
    const supportedClaim = result.admitted.find((c) => c.index === 2);
    expect(supportedClaim?.quote).toBe("Wrote SQL queries against Snowflake");
  });

  // Regression: with malformed entries dropped, later verified claims shift
  // left in the filtered array. Resolving `supports` against the SHIFTED
  // positions silently links the inferred claim to the WRONG evidence.
  it("does not mis-link an inferred claim's supports when an earlier malformed entry shifts positions", async () => {
    const fakeAi: AiClient = {
      chatJson: async () => ({
        claims: [
          { kind: "verified" }, // original index 0: malformed, dropped
          verifiedClaim(), // original index 1 ("A"): "Built weekly fraud dashboards in Tableau"
          verifiedClaim({
            text: "SQL against Snowflake",
            labels: ["sql"],
            quote: "Wrote SQL queries against Snowflake",
          }), // original index 2 ("B")
          {
            kind: "inferred",
            type: "skill",
            text: "Data visualization",
            labels: ["data-visualization"],
            supports: [1], // model means "A" (original index 1)
            reasoning: "Sustained Tableau dashboard work demonstrates data visualization.",
          }, // original index 3
        ],
      }),
    };
    const result = await extractClaimsFromDocument(DOC, fakeAi);
    expect(result.malformedCount).toBe(1);
    const inferred = result.admitted.find((c) => c.kind === "inferred");
    expect(inferred).toBeDefined();
    expect(inferred!.supports).toEqual([1]);
    const linkedClaim = result.admitted.find((c) => c.index === 1);
    expect(linkedClaim?.quote).toBe("Built weekly fraud dashboards in Tableau");
  });
});
