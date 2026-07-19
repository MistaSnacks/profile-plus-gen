// Verbatim quote matching, tolerant only of whitespace runs and letter case.
// This is the admit-gate for the claims corpus: a claim whose quote this
// function cannot locate in the source document does not enter the corpus.

export interface QuoteMatch {
  found: boolean;
  /** Offset into the ORIGINAL source string (inclusive). -1 when not found. */
  start: number;
  /** Offset into the ORIGINAL source string (exclusive). -1 when not found. */
  end: number;
}

interface Normalized {
  norm: string;
  /** map[i] = index in the original string of the char that produced norm[i] */
  map: number[];
}

function normalizeWithMap(text: string): Normalized {
  let norm = "";
  const map: number[] = [];
  let lastWasSpace = true; // drops leading whitespace
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        norm += " ";
        map.push(i);
        lastWasSpace = true;
      }
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      lastWasSpace = false;
    }
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export function findQuote(quote: string, source: string): QuoteMatch {
  const notFound: QuoteMatch = { found: false, start: -1, end: -1 };
  const q = normalizeWithMap(quote).norm;
  if (q.length === 0) return notFound;
  const { norm, map } = normalizeWithMap(source);
  const idx = norm.indexOf(q);
  if (idx === -1) return notFound;
  return { found: true, start: map[idx], end: map[idx + q.length - 1] + 1 };
}
