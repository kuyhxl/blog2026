// 링크 그래프. 빌드 때 content/의 공개 노트만으로 한 번 만든다.
// 브레인 맵, FIG. 01, 백링크, 이전·다음 글이 모두 이 데이터를 쓴다(CLAUDE.md "브레인 맵").
// - 점: 노트 하나에 하나. 본문이 빈 CS 노트(빈 노드)는 흐린 점이다
// - 선: 위키링크와 본문 끼워 넣기 [언급한 글, 언급된 글]. 그림과 같은 글 안의 제목 링크는 빼고, 같은 쌍은 한 번만 센다
import { createHash } from "node:crypto";
import type { Nodes, Root } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { toString } from "mdast-util-to-string";
import { SKIP, visit } from "unist-util-visit";
import { IMAGE_EXT, WIKILINK, baseName, noteKey, parseWikilink } from "./obsidian.ts";
import { allNotes, posts, type Note } from "./posts.ts";

export type GraphNode = {
  slug: string;
  title: string;
  short: string; // 점 이름표
  date: string;
  type: string;
  tags: string[];
  empty: boolean;
  x: number; // 처음 자리(0~1)
  y: number;
};

export type Graph = { nodes: GraphNode[]; edges: [number, number][] };

export type Backlink = { slug: string; title: string; date: string; before: string; text: string; after: string };

// 점 이름표: 제목에서 ": " 앞부분. 길면 말줄임표로 자른다
const SHORT_MAX = 14;
export function shortTitle(title: string) {
  const head = title.split(": ")[0].trim();
  return head.length > SHORT_MAX ? head.slice(0, SHORT_MAX - 1).trimEnd() + "…" : head;
}

// 위키링크를 보이는 글자로: [[노트|별칭]] → 별칭, [[노트#제목]] → 노트 > 제목
function shown(inner: string) {
  const { target, heading, alias } = parseWikilink(inner);
  const name = baseName(target).replace(/\.md$/i, "");
  return alias ?? (heading ? (name ? `${name} > ${heading}` : heading) : name);
}

// 발췌: 링크가 있는 문단에서 링크 앞뒤를 잘라 온다. 잘린 쪽에는 …를 붙인다
const BEFORE = 46, AFTER = 34;
function cut(before: string, after: string) {
  let b = before.replace(/\s+/g, " ");
  let a = after.replace(/\s+/g, " ");
  if (b.length > BEFORE) {
    b = b.slice(-BEFORE);
    const sp = b.indexOf(" ");
    b = "… " + (sp >= 0 && sp < 12 ? b.slice(sp + 1) : b);
  }
  if (a.length > AFTER) {
    a = a.slice(0, AFTER);
    const sp = a.lastIndexOf(" ");
    a = (sp > AFTER - 12 ? a.slice(0, sp) : a) + " …";
  }
  return { before: b, after: a };
}

type Mention = { to: string; before: string; text: string; after: string };

// 한 노트의 본문에서 다른 노트를 가리키는 링크를 모은다.
// 글 화면(remark-obsidian)과 같은 곳에서만 찾는다: 글자 조각 가운데 링크 밖에 있는 것. 인라인 코드, 수식, 코드 블록 안의 [[…]]는 링크가 아니다
function mentions(n: Note, byKey: Map<string, Note>): Mention[] {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(n.body) as Root;
  const out: Mention[] = [];
  visit(tree, (node) => {
    if (node.type !== "paragraph" && node.type !== "heading" && node.type !== "tableCell") return;
    if (!toString(node).includes("[[")) return;
    // 문단을 앞에서부터 읽으며 위키링크는 보이는 글자로 바꾸고, 각 링크가 어디에 놓이는지 기억한다
    let plain = "";
    const spans: { key: string; s: number; e: number }[] = [];
    const walk = (c: Nodes, inLink: boolean) => {
      if (c.type === "text" && !inLink) {
        let last = 0;
        for (const m of c.value.matchAll(WIKILINK)) {
          const { target } = parseWikilink(m[2]);
          plain += c.value.slice(last, m.index);
          const text = shown(m[2]);
          if (target && !(m[1] === "!" && IMAGE_EXT.test(target))) spans.push({ key: noteKey(target), s: plain.length, e: plain.length + text.length });
          plain += text;
          last = m.index + m[0].length;
        }
        plain += c.value.slice(last);
      } else if ("children" in c) for (const k of c.children) walk(k, inLink || c.type === "link" || c.type === "linkReference");
      else plain += toString(c);
    };
    walk(node, false);
    for (const sp of spans) {
      const to = byKey.get(sp.key);
      if (!to || to.slug === n.slug) continue;
      out.push({ to: to.slug, text: plain.slice(sp.s, sp.e), ...cut(plain.slice(0, sp.s), plain.slice(sp.e)) });
    }
    return SKIP;
  });
  return out;
}

// 처음 자리: 힘 기반 배치를 같은 시작값으로 돌린다. 링크가 그대로면 모양도 매번 같다
function layout(count: number, edges: [number, number][]): { x: number; y: number }[] {
  const pos = Array.from({ length: count }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / Math.max(1, count)) * 0.5;
    const a = i * 2.399963; // 황금각으로 퍼뜨린다
    return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) };
  });
  if (count < 2) return pos.map(() => ({ x: 0.5, y: 0.5 }));
  const k = Math.sqrt(1 / count) * 0.9;
  let temp = 0.1;
  for (let it = 0; it < 400; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        const d = Math.max(Math.hypot(dx, dy), 1e-4), f = (k * k) / d;
        disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f;
        disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f;
      }
    for (const [a, b] of edges) {
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
      const d = Math.max(Math.hypot(dx, dy), 1e-4), f = (d * d) / k;
      disp[a].x -= (dx / d) * f; disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f; disp[b].y += (dy / d) * f;
    }
    for (let i = 0; i < count; i++) {
      // 링크 없는 점이 멀리 흩어지지 않게 가운데로 조금 끈다
      disp[i].x += (0.5 - pos[i].x) * k * 0.6;
      disp[i].y += (0.5 - pos[i].y) * k * 0.6;
      const d = Math.max(Math.hypot(disp[i].x, disp[i].y), 1e-9), step = Math.min(d, temp);
      pos[i].x += (disp[i].x / d) * step;
      pos[i].y += (disp[i].y / d) * step;
    }
    temp *= 0.985;
  }
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return pos.map((p) => ({ x: x1 > x0 ? (p.x - x0) / (x1 - x0) : 0.5, y: y1 > y0 ? (p.y - y0) / (y1 - y0) : 0.5 }));
}

type Built = { graph: Graph; backlinks: Map<string, Backlink[]> };
let cache: { key: string; built: Built } | null = null;

export function linkGraph(): Built {
  const notes = allNotes();
  // 개발 중에는 동기화로 바뀐 내용을 다시 읽도록, 노트가 하나라도 바뀌면 새로 만든다(본문의 길이가 아니라 내용 전체로 비교한다)
  const key = createHash("sha256").update(JSON.stringify(notes)).digest("hex");
  if (cache?.key === key) return cache.built;

  const ordered = notes.slice().sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug));
  const index = new Map(ordered.map((n, i) => [n.slug, i]));
  const byKey = new Map(notes.map((n) => [noteKey(n.name), n]));

  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const backlinks = new Map<string, Backlink[]>();
  for (const n of ordered) {
    const seenTo = new Set<string>();
    for (const m of mentions(n, byKey)) {
      const k = `${n.slug}>${m.to}`;
      if (!edgeSet.has(k)) {
        edgeSet.add(k);
        edges.push([index.get(n.slug)!, index.get(m.to)!]);
      }
      // 백링크는 언급한 글마다 한 줄. 발췌는 처음 언급한 곳에서
      if (seenTo.has(m.to) || n.empty) continue;
      seenTo.add(m.to);
      const list = backlinks.get(m.to) ?? [];
      list.push({ slug: n.slug, title: n.title, date: n.date, before: m.before, text: m.text, after: m.after });
      backlinks.set(m.to, list);
    }
  }
  for (const list of backlinks.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "ko"));

  // 배치는 방향을 뺀 연결로 계산한다
  const undirected = new Set<string>();
  const pairs: [number, number][] = [];
  for (const [a, b] of edges) {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!undirected.has(k)) {
      undirected.add(k);
      pairs.push([a, b]);
    }
  }
  const at = layout(ordered.length, pairs);
  const nodes: GraphNode[] = ordered.map((n, i) => ({
    slug: n.slug, title: n.title, short: shortTitle(n.title), date: n.date, type: n.type, tags: n.tags, empty: n.empty, x: at[i].x, y: at[i].y,
  }));
  const built = { graph: { nodes, edges }, backlinks };
  cache = { key, built };
  return built;
}

// 글 본문의 FIG. 01: 이 글과 직접 이어진 글(양방향)과, 그 사이의 선
export function neighborhood(slug: string): Graph & { self: number } {
  const { graph } = linkGraph();
  const i = graph.nodes.findIndex((n) => n.slug === slug);
  const near = new Set<number>([i]);
  for (const [a, b] of graph.edges) {
    if (a === i) near.add(b);
    if (b === i) near.add(a);
  }
  const keep = [...near];
  const map = new Map(keep.map((n, k) => [n, k]));
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (const [a, b] of graph.edges) {
    if (!map.has(a) || !map.has(b)) continue;
    const x = map.get(a)!, y = map.get(b)!;
    const k = x < y ? `${x}|${y}` : `${y}|${x}`;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push([x, y]);
  }
  return { nodes: keep.map((n) => graph.nodes[n]), edges, self: map.get(i)! };
}

// align: 창 가장자리 가까운 점의 이름표가 창 밖으로 나가지 않게, 왼쪽 점은 오른쪽으로, 오른쪽 점은 왼쪽으로 붙인다
export type ConnectedNode = GraphNode & { px: number; py: number; up: boolean; align: "start" | "center" | "end" };

// FIG. 01의 배치(270×240 창 좌표): 이 글을 가운데에 두고, 이웃은 전체 지도에서의 방향 순서를 지킨 채 고르게 한 바퀴 둘러 놓는다.
// 위쪽 절반의 점은 이름표를 점 위에 단다(PostV2의 up)
export const FIG = { W: 270, H: 240, CX: 135, CY: 120, RX: 90, RY: 80 };
export function connected(slug: string): { nodes: ConnectedNode[]; pairs: [number, number][]; self: number } {
  const { nodes, edges, self } = neighborhood(slug);
  const me = nodes[self];
  const others = nodes.map((n, i) => ({ i, a: Math.atan2(n.y - me.y, n.x - me.x) })).filter((o) => o.i !== self).sort((p, q) => p.a - q.a);
  const step = (2 * Math.PI) / Math.max(1, others.length);
  // 고르게 나눈 각을 원래 방향들에 가장 잘 맞도록 통째로 돌린다(각 차이의 원형 평균)
  let sx = 0, sy = 0;
  others.forEach((o, k) => {
    sx += Math.cos(o.a - k * step);
    sy += Math.sin(o.a - k * step);
  });
  const turn = others.length ? Math.atan2(sy, sx) : -Math.PI / 2;
  const at = new Map(others.map((o, k) => [o.i, turn + k * step]));
  const out = nodes.map((n, i) => {
    if (i === self) return { ...n, px: FIG.CX, py: FIG.CY, up: false, align: "center" as const };
    const a = at.get(i)!;
    const px = FIG.CX + Math.cos(a) * FIG.RX, py = FIG.CY + Math.sin(a) * FIG.RY;
    return { ...n, px, py, up: py < FIG.CY - 10, align: px < 80 ? ("start" as const) : px > FIG.W - 80 ? ("end" as const) : ("center" as const) };
  });
  return { nodes: out, pairs: edges, self };
}

// 이전 글(더 오래된 글)과 다음 글(더 새 글). 빈 노드는 빠진다
export function prevNext(slug: string) {
  const list = posts(); // 최신 글이 앞
  const i = list.findIndex((p) => p.slug === slug);
  return { prev: list[i + 1] ?? null, next: i > 0 ? list[i - 1] : null };
}
