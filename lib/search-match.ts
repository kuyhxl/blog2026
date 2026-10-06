// 검색 창의 찾기 규칙. 원본은 SearchV2 스크립트의 spans, pieces, snippet, search.
// 시안은 제목·요약·태그에서만 찾지만 실제로는 본문까지 찾는다(README "검색 창")
import type { SearchEntry } from "@/lib/content/search";

const SNIP = 76; // 일치한 문장에서 잘라 보여 주는 글자 수

const lower = (s: string) => s.normalize("NFC").toLowerCase();

// 글에서 낱말들이 나오는 자리 [시작, 끝]. 겹치거나 맞닿으면 하나로 합친다
function spans(text: string, terms: string[]) {
  const low = lower(text);
  const found: [number, number][] = [];
  for (const t of terms) for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + t.length)) found.push([i, i + t.length]);
  found.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of found) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

export type Piece = { t: string; hit: boolean };

// 글을 조각으로 나눈다. hit인 조각이 일치한 글자다
export function pieces(text: string, terms: string[]): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const [s, e] of terms.length ? spans(text, terms) : []) {
    if (s > at) out.push({ t: text.slice(at, s), hit: false });
    out.push({ t: text.slice(s, e), hit: true });
    at = e;
  }
  if (at < text.length) out.push({ t: text.slice(at), hit: false });
  return out;
}

// 긴 문장은 처음 일치한 곳 둘레만 잘라낸다. 낱말 가운데에서 끊지 않는다
function snippet(text: string, terms: string[]) {
  if (text.length <= SNIP) return text;
  const sp = spans(text, terms);
  let a = sp.length ? Math.max(0, sp[0][0] - 22) : 0;
  if (a > 0) {
    const s = text.indexOf(" ", a);
    a = s >= 0 && s < sp[0][0] ? s + 1 : sp[0][0];
  }
  let b = Math.min(text.length, a + SNIP);
  if (b < text.length) {
    const s = text.lastIndexOf(" ", b);
    if (s > a + SNIP * 0.6) b = s;
  }
  return (a > 0 ? "… " : "") + text.slice(a, b) + (b < text.length ? " …" : "");
}

export type Hit = { entry: SearchEntry; snip: string };

// 찾을 때마다 글 전체를 소문자로 바꾸지 않도록, 인덱스를 처음 받았을 때 한 번만 바꿔 둔다
type Prepared = { entry: SearchEntry; T: string; G: string; S: string; B: string; lines: string[]; low: string[] };
const prepared = new WeakMap<SearchEntry[], Prepared[]>();
export function prepare(index: SearchEntry[]) {
  let p = prepared.get(index);
  if (!p) {
    p = index.map((entry) => {
      const lines = entry.text.split("\n");
      return { entry, T: lower(entry.title), G: lower(entry.tags.join(" ")), S: lower(entry.summary), B: lower(entry.text), lines, low: lines.map(lower) };
    });
    prepared.set(index, p);
  }
  return p;
}

// 낱말(띄어쓰기로 나눈 것)이 제목·태그·요약·본문 어딘가에 모두 들어 있는 글.
// 낱말마다 제목 8, 태그 4, 요약 2, 본문 1을 더해 높은 글이 앞에 오고, 같으면 최신 글이 먼저다
export function search(index: SearchEntry[], q: string): { terms: string[]; hits: Hit[] } | null {
  const terms = lower(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  const scored: { p: Prepared; score: number }[] = [];
  for (const p of prepare(index)) {
    const { T, G, S, B } = p;
    let score = 0;
    for (const t of terms) {
      const inT = T.includes(t), inG = G.includes(t), inS = S.includes(t), inB = B.includes(t);
      if (!inT && !inG && !inS && !inB) {
        score = -1;
        break;
      }
      score += (inT ? 8 : 0) + (inG ? 4 : 0) + (inS ? 2 : 0) + (inB ? 1 : 0);
    }
    if (score >= 0) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || b.p.entry.date.localeCompare(a.p.entry.date));
  // 발췌: 요약에서 맞으면 요약, 아니면 본문에서 처음 맞은 문단, 둘 다 아니면 요약
  const hits = scored.map(({ p }) => {
    const inSummary = terms.some((t) => p.S.includes(t));
    const at = inSummary ? -1 : p.low.findIndex((line) => terms.some((t) => line.includes(t)));
    return { entry: p.entry, snip: snippet(at >= 0 ? p.lines[at] : p.entry.summary, terms) };
  });
  return { terms, hits };
}

// 맞은 낱말이 들어 있는 태그인가
export const tagHit = (tag: string, terms: string[]) => terms.some((t) => lower(tag).includes(t));
