import { describe, it, expect } from "vitest";
import { findQuote } from "../supabase/functions/_shared/quote-match.ts";

describe("findQuote", () => {
  it("finds an exact quote and returns original offsets", () => {
    const source = "Led fraud investigations using SQL and Tableau daily.";
    const result = findQuote("using SQL and Tableau", source);
    expect(result.found).toBe(true);
    expect(source.slice(result.start, result.end)).toBe("using SQL and Tableau");
  });

  it("matches across differing whitespace runs", () => {
    const source = "Built   dashboards\n\nin Tableau for executives.";
    const result = findQuote("Built dashboards in Tableau", source);
    expect(result.found).toBe(true);
    expect(result.start).toBe(0);
    expect(source.slice(result.start, result.end)).toBe("Built   dashboards\n\nin Tableau");
  });

  it("matches case-insensitively", () => {
    const source = "Managed a team of five analysts.";
    expect(findQuote("managed a team", source).found).toBe(true);
  });

  it("returns not-found for absent text", () => {
    const result = findQuote("Kubernetes", "SQL and Tableau experience.");
    expect(result).toEqual({ found: false, start: -1, end: -1 });
  });

  it("returns not-found for an empty or whitespace-only quote", () => {
    expect(findQuote("", "anything").found).toBe(false);
    expect(findQuote("   ", "anything").found).toBe(false);
  });

  it("ignores leading/trailing whitespace in the quote", () => {
    const source = "Reduced chargebacks by 18% in one year.";
    const result = findQuote("  Reduced chargebacks by 18%  ", source);
    expect(result.found).toBe(true);
    expect(source.slice(result.start, result.end)).toBe("Reduced chargebacks by 18%");
  });
});
