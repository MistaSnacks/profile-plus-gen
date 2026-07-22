import { describe, it, expect } from "vitest";
import {
  buildCoveragePrompt,
  admitCoverage,
  type CandidateClaim,
} from "../supabase/functions/_shared/coverage.ts";

const CLAIMS: CandidateClaim[] = [
  { id: "c-verified", kind: "verified", type: "skill", text: "Tableau dashboard development" },
  { id: "c-inferred", kind: "inferred", type: "skill", text: "Data visualization" },
  { id: "c-other", kind: "verified", type: "role", text: "Fraud Operations Analyst" },
];

const LANE = {
  selected: { name: "Fraud operations", claim_ids: ["c-verified", "c-other"] },
  rationale: "The posting is mostly fraud work.",
  competing: [{ name: "Analytics", claim_ids: ["c-inferred"] }],
  excluded_claim_ids: ["c-inferred"],
};

const payload = (coverage: unknown[], lane: unknown = LANE) => ({ lanes: [], selected_lane: lane, coverage });

describe("buildCoveragePrompt", () => {
  it("lists claim ids and requirement indexes for the model to reference", () => {
    const { user } = buildCoveragePrompt(
      [{ text: "Tableau experience", type: "skill", priority: "required" }],
      CLAIMS,
    );
    expect(user).toContain("c-verified");
    expect(user).toContain("Tableau experience");
    expect(user).toContain("[0]");
  });
});

describe("admitCoverage", () => {
  it("admits a verified match backed by a verified claim", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-verified"], rationale: "Direct." }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("verified");
    expect(result.coverage[0].claimIds).toEqual(["c-verified"]);
    expect(result.demoted).toHaveLength(0);
  });

  it("drops claim ids that were not in the candidate set", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-verified", "c-hallucinated"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].claimIds).toEqual(["c-verified"]);
  });

  it("demotes a verified status backed only by inferred claims", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-inferred"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("inferred");
    expect(result.demoted[0].reason).toMatch(/no verified claim/i);
  });

  it("demotes a covered status that cites nothing to gap", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "inferred", claim_ids: [], rationale: "trust me" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("gap");
    expect(result.coverage[0].claimIds).toEqual([]);
    expect(result.demoted[0].reason).toMatch(/cites no admitted claim/i);
  });

  it("demotes to gap when every cited id is unknown", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["nope"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("gap");
  });

  it("strips claim ids from an explicit gap", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "gap", claim_ids: ["c-verified"], rationale: null }]),
      1,
      CLAIMS,
    );
    expect(result.coverage[0].status).toBe("gap");
    expect(result.coverage[0].claimIds).toEqual([]);
  });

  it("defaults requirements the model omitted to gap", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 0, status: "verified", claim_ids: ["c-verified"], rationale: "x" }]),
      3,
      CLAIMS,
    );
    expect(result.coverage).toHaveLength(3);
    expect(result.coverage[1].status).toBe("gap");
    expect(result.coverage[2].status).toBe("gap");
  });

  it("treats an out-of-range requirement index as malformed", () => {
    const result = admitCoverage(
      payload([{ requirement_index: 7, status: "verified", claim_ids: ["c-verified"], rationale: "x" }]),
      1,
      CLAIMS,
    );
    expect(result.malformed[0].reason).toMatch(/requirement_index/i);
  });

  it("keeps only candidate claim ids in the selected lane", () => {
    const result = admitCoverage(
      payload([], { ...LANE, selected: { name: "Fraud operations", claim_ids: ["c-verified", "ghost"] } }),
      0,
      CLAIMS,
    );
    expect(result.lane.selected.claimIds).toEqual(["c-verified"]);
    expect(result.laneFallback).toBe(false);
  });

  it("falls back to all claims when the selected lane resolves to nothing", () => {
    const result = admitCoverage(
      payload([], { ...LANE, selected: { name: "Ghosts", claim_ids: ["ghost"] } }),
      0,
      CLAIMS,
    );
    expect(result.laneFallback).toBe(true);
    expect(result.lane.selected.claimIds).toEqual(["c-verified", "c-inferred", "c-other"]);
  });

  it("throws when the payload has no coverage array", () => {
    expect(() => admitCoverage({ selected_lane: LANE }, 1, CLAIMS)).toThrow(/coverage/);
  });
});
