import { describe, it, expect } from "vitest";
import {
  buildJdParsePrompt,
  parseJdResponse,
} from "../supabase/functions/_shared/jd-parse.ts";

const req = (over: Record<string, unknown> = {}) => ({
  text: "5+ years in fraud operations",
  type: "experience",
  priority: "required",
  ...over,
});

describe("buildJdParsePrompt", () => {
  it("embeds the posting text in the user message", () => {
    const { system, user } = buildJdParsePrompt("Fraud Analyst at Brightpay");
    expect(user).toContain("Fraud Analyst at Brightpay");
    expect(system).toContain("requirements");
  });
});

describe("parseJdResponse", () => {
  it("accepts a well-formed payload", () => {
    const result = parseJdResponse({
      title: "Fraud Analyst",
      company: "Brightpay",
      requirements: [req()],
    });
    expect(result.title).toBe("Fraud Analyst");
    expect(result.company).toBe("Brightpay");
    expect(result.requirements).toHaveLength(1);
    expect(result.malformed).toHaveLength(0);
  });

  it("defaults missing title and company to null", () => {
    const result = parseJdResponse({ requirements: [req()] });
    expect(result.title).toBeNull();
    expect(result.company).toBeNull();
  });

  it("throws when the top level has no requirements array", () => {
    expect(() => parseJdResponse({ title: "x" })).toThrow(/requirements/);
  });

  it("collects malformed entries without dropping valid ones", () => {
    const result = parseJdResponse({
      requirements: [
        req(),
        req({ type: "wizardry" }),
        req({ priority: "someday" }),
        req({ text: "   " }),
        "not an object",
      ],
    });
    expect(result.requirements).toHaveLength(1);
    expect(result.malformed).toHaveLength(4);
    expect(result.malformed[0].reason).toMatch(/invalid type/i);
    expect(result.malformed[1].reason).toMatch(/invalid priority/i);
    expect(result.malformed[2].reason).toMatch(/missing text/i);
    expect(result.malformed[3].reason).toMatch(/not an object/i);
  });
});
