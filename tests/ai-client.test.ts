import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "../supabase/functions/_shared/ai-client.ts";

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse('{"claims": []}')).toEqual({ claims: [] });
  });

  it("strips ```json fences", () => {
    expect(parseJsonResponse('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    expect(parseJsonResponse('```\n[1, 2]\n```')).toEqual([1, 2]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseJsonResponse('  \n {"a": 1} \n ')).toEqual({ a: 1 });
  });

  it("throws a descriptive error on garbage", () => {
    expect(() => parseJsonResponse("Sure! Here is your resume."))
      .toThrow(/unparseable JSON/);
  });
});
