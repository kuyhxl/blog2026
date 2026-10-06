// Beauty of CS 지도의 배치와 길 내기. 원본은 BeautyOfCSV2 스크립트의 layout, path, routeIntra, routeCross, autoView, fitAll
// (HomeV2의 미리 보기도 같은 규칙). 서버(홈 미리 보기)와 브라우저(지도 화면)가 함께 쓴다.
// 큰 개념이 놓이는 칸(ZONES의 cells)과 두 줄로 쓰는 이름(TWO)은 시안이 손으로 정한 값이다.
// 새 개념이나 선을 넣을 때 고칠 곳은 CLAUDE.md "Beauty of CS"에 적어 두었다

export type MapNode = { id: string; title: string; zone: string; big: boolean; parent: string | null; kids: string[] };
export type MapEdge = { from: string; to: string; pre: boolean; note: string };
export type MapPost = { slug: string; title: string; date: string; summary: string };
export type MapData = {
  nodes: Record<string, MapNode>;
  edges: MapEdge[];
  posts: Record<string, MapPost>; // 개념 id → 본문이 있는 공개 CS 글
};

// 과목 구역과, 구역 안에서 큰 개념이 놓이는 칸 [열, 행]. 이웃한 칸끼리만 선수 관계가 이어지도록 놓았다
export const ZONES = [
  { id: "ca", code: "CA", name: "컴퓨터 구조", band: 0, x: 0, w: 584, cols: 3, rows: 3, cells: { "ca-data-repr": [0, 0], "ca-digital-logic": [1, 0], "ca-isa": [0, 1], "ca-processor": [1, 1], "ca-storage-io": [2, 1], "ca-memory-hierarchy": [1, 2], "ca-parallelism": [2, 2] } },
  { id: "ds", code: "DS", name: "자료구조", band: 0, x: 608, w: 584, cols: 3, rows: 3, cells: { "ds-complexity": [0, 0], "ds-linear": [1, 0], "ds-hashing": [2, 0], "ds-stack-queue": [0, 1], "ds-tree": [1, 1], "ds-sorting": [2, 1], "ds-graph": [1, 2], "ds-heap": [2, 2] } },
  { id: "os", code: "OS", name: "운영체제", band: 1, x: 0, w: 1192, cols: 6, rows: 2, cells: { "os-fs": [0, 0], "os-io": [1, 0], "os-structure": [2, 0], "os-process": [3, 0], "os-sync": [4, 0], "os-deadlock": [5, 0], "os-vm": [1, 1], "os-memory": [2, 1], "os-scheduling": [3, 1] } },
  { id: "net", code: "NET", name: "네트워크", band: 2, x: 0, w: 392, cols: 2, rows: 3, cells: { "net-basics": [0, 0], "net-app": [1, 0], "net-security": [0, 1], "net-transport": [1, 1], "net-link": [0, 2], "net-network": [1, 2] } },
  { id: "db", code: "DB", name: "데이터베이스", band: 2, x: 416, w: 776, cols: 4, rows: 3, cells: { "db-relational": [0, 0], "db-sql": [1, 0], "db-transaction": [2, 0], "db-concurrency": [3, 0], "db-design": [0, 1], "db-query": [1, 1], "db-recovery": [2, 1], "db-distributed": [3, 1], "db-index": [1, 2], "db-storage": [2, 2] } },
] as const satisfies readonly { id: string; code: string; name: string; band: number; x: number; w: number; cols: number; rows: number; cells: Record<string, readonly [number, number]> }[];

// 한 줄에 들어가지 않아 두 줄로 쓰는 세부 개념. 목록에 없는 이름도 이 길이를 넘으면 두 줄로 쓴다
const TWO = new Set(["os-sched-algorithms", "ca-atomic", "ca-io-methods", "db-clustered-index", "net-error-detection", "ds-collision", "ca-sequential", "os-deadlock-avoidance", "ca-instruction-format", "net-forwarding", "ca-procedure-call", "ds-balanced-tree", "ca-performance", "net-layers", "db-query-optimization"]);
const ONE_LINE_MAX = 15; // 시안에서 한 줄로 쓴 가장 긴 이름의 글자 수
export const twoLines = (n: MapNode) => !n.big && (TWO.has(n.id) || n.title.length > ONE_LINE_MAX);
// 두 줄로 쓸 때 줄을 바꾸는 자리: 괄호 앞, 괄호가 없으면 가운뎃점 뒤(둘 다 없으면 띄어쓰기에서 알아서 나뉜다)
export const softBreak = (t: string) => (t.includes("(") ? t.replace("(", "\n(") : t.replace("·", "·\n"));

// 치수(지도 좌표, px)
export const W = 160, H = 32; // 큰 개념 상자
const AV = 32, RG = 24; // 열 사이 통로, 행 사이 간격
const CI = 8, CH = 26, CH2 = 40, CG = 4, CT = 8; // 세부 개념: 들여쓰기, 높이(한 줄·두 줄), 간격, 위 여백
const ZT = 40, ZB = 20; // 구역 위·아래 여백
const BG = 28; // 구역 띠 사이 간격(가로 통로)
export const MW = 1192, BASE_H = 740; // 지도 너비, 처음 배율을 정할 때 쓰는 기준 높이
const R = 6; // 선이 꺾이는 곳의 반지름

export type Rect = { id: string; x: number; y: number; w: number; h: number; big: boolean; zone: string; band: number; col: number; row: number; colX: number };
export type Zone = { id: string; code: string; name: string; x: number; y: number; w: number; h: number; colX: number[] };
export type Layout = { rect: Record<string, Rect>; zones: Zone[]; hw: number[]; through: number[]; mh: number };
type Pt = [number, number];

// 펼친 상태에 맞춰 모든 상자의 자리를 정한다
export function layout(nodes: Record<string, MapNode>, expanded: Record<string, boolean>): Layout {
  const rect: Record<string, Rect> = {}, zones: Zone[] = [], hw: number[] = [];
  const kidH = (k: string) => (nodes[k] && twoLines(nodes[k]) ? CH2 : CH);
  const clusterH = (id: string) => (expanded[id] && nodes[id] ? nodes[id].kids.reduce((s, k, i) => s + kidH(k) + (i ? CG : 0), H + CT) : H);
  let bandY = 0;
  for (const b of [0, 1, 2]) {
    const built = ZONES.filter((z) => z.band === b).map((z) => {
      const pad = (z.w - (z.cols * W + (z.cols - 1) * AV)) / 2;
      const rowH = Array.from({ length: z.rows }, () => H);
      for (const [id, [, r]] of Object.entries(z.cells) as [string, readonly [number, number]][]) if (nodes[id]) rowH[r] = Math.max(rowH[r], clusterH(id));
      return { z, pad, rowH, h: ZT + rowH.reduce((s, h, i) => s + h + (i ? RG : 0), 0) + ZB };
    });
    const bandH = Math.max(...built.map((q) => q.h));
    for (const { z, pad, rowH } of built) {
      const rowY: number[] = [];
      let y = bandY + ZT;
      rowH.forEach((h, r) => {
        rowY[r] = y;
        y += h + RG;
      });
      const colX = Array.from({ length: z.cols }, (_, c) => z.x + pad + c * (W + AV));
      for (const [id, [c, r]] of Object.entries(z.cells) as [string, readonly [number, number]][]) {
        if (!nodes[id]) continue;
        rect[id] = { id, x: colX[c], y: rowY[r], w: W, h: H, big: true, zone: z.id, band: b, col: c, row: r, colX: colX[c] };
        if (expanded[id]) {
          let cy = rowY[r] + H + CT;
          for (const k of nodes[id].kids) {
            const h = kidH(k);
            rect[k] = { id: k, x: colX[c] + CI, y: cy, w: W - CI, h, big: false, zone: z.id, band: b, col: c, row: r, colX: colX[c] };
            cy += h + CG;
          }
        }
      }
      zones.push({ id: z.id, code: z.code, name: z.name, x: z.x, y: bandY, w: z.w, h: bandH, colX });
    }
    bandY += bandH;
    if (b < 2) {
      hw[b] = bandY;
      bandY += BG;
    }
  }
  // 운영체제 띠를 세로로 지나갈 수 있는 통로
  const os = zones.find((z) => z.id === "os")!;
  const through = [os.colX[0] - 18];
  for (let c = 0; c < 5; c++) through.push(os.colX[c] + W + AV / 2);
  through.push(os.colX[5] + W + 18);
  return { rect, zones, hw, through, mh: bandY };
}

// 점들을 지나는 선. 꺾이는 곳은 둥글게, 끝은 trim만큼 덜 그린다. 화살촉도 함께 돌려준다
export function path(points: Pt[], trim: number) {
  const pts: Pt[] = [];
  for (const p of points) {
    const q = pts[pts.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5) continue;
    if (pts.length > 1) {
      const o = pts[pts.length - 2];
      if ((Math.abs(o[0] - q[0]) < 0.5 && Math.abs(q[0] - p[0]) < 0.5) || (Math.abs(o[1] - q[1]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5)) {
        pts[pts.length - 1] = p;
        continue;
      }
    }
    pts.push(p);
  }
  const n = pts.length, a = pts[n - 2], z = pts[n - 1];
  const len = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1;
  const ux = (z[0] - a[0]) / len, uy = (z[1] - a[1]) / len;
  const end: Pt = [z[0] - ux * trim, z[1] - uy * trim];
  let d = "M" + pts[0][0] + " " + pts[0][1];
  for (let i = 1; i < n - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = i === n - 2 ? end : pts[i + 1];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const r = Math.min(R, d1 / 2, d2 / 2);
    d += "L" + (p1[0] - ((p1[0] - p0[0]) / d1) * r).toFixed(1) + " " + (p1[1] - ((p1[1] - p0[1]) / d1) * r).toFixed(1);
    d += "Q" + p1[0] + " " + p1[1] + " " + (p1[0] + ((p2[0] - p1[0]) / d2) * r).toFixed(1) + " " + (p1[1] + ((p2[1] - p1[1]) / d2) * r).toFixed(1);
  }
  d += "L" + end[0].toFixed(1) + " " + end[1].toFixed(1);
  const bx = z[0] - ux * 7, by = z[1] - uy * 7;
  const head = "M" + z[0] + " " + z[1] + "L" + (bx - uy * 3.4).toFixed(1) + " " + (by + ux * 3.4).toFixed(1) + "L" + (bx + uy * 3.4).toFixed(1) + " " + (by - ux * 3.4).toFixed(1) + "Z";
  return { d, head };
}

// 같은 구역 안 큰 개념 사이: 이웃한 칸이므로 곧게 잇거나 사이 통로로 한 번 돌아간다
function routeIntra(L: Layout, a: string, b: string, expanded: Record<string, boolean>): Pt[] {
  const A = L.rect[a], B = L.rect[b];
  const dc = B.col - A.col, dr = B.row - A.row;
  const ay = A.y + H / 2, by = B.y + H / 2;
  if (dr === 0) return dc > 0 ? [[A.x + W, ay], [B.x, by]] : [[A.x, ay], [B.x + W, by]];
  if (dc === 0) {
    const upper = dr > 0 ? a : b;
    if (!expanded[upper]) return dr > 0 ? [[A.x + W / 2, A.y + H], [B.x + W / 2, B.y]] : [[A.x + W / 2, A.y], [B.x + W / 2, B.y + H]];
    const lane = A.x + W + AV / 2, s = dr > 0 ? 1 : -1;
    return [[A.x + W, ay + 7 * s], [lane, ay + 7 * s], [lane, by - 7 * s], [B.x + W, by - 7 * s]];
  }
  const lane = (dc > 0 ? A.x + W : B.x + W) + AV / 2, s = dr > 0 ? 1 : -1;
  return [[dc > 0 ? A.x + W : A.x, ay + 7 * s], [lane, ay + 7 * s], [lane, by - 7 * s], [dc > 0 ? B.x : B.x + W, by - 7 * s]];
}

// 다른 구역 사이: 상자 옆 통로로 나와 띠 사이 가로 통로를 타고 간다
function routeCross(L: Layout, a: string, b: string, pre: boolean): Pt[] {
  const A = L.rect[a], B = L.rect[b];
  const cx = (n: Rect) => n.x + n.w / 2;
  const side = (n: Rect, o: Rect) => (!n.big || cx(o) >= cx(n) ? 1 : -1); // 세부 개념은 늘 오른쪽으로 나온다
  // 점선(연관 개념)은 실선과 겹치지 않게 통로 안쪽 줄을 따로 쓴다
  const lo = pre ? 9 : 13, ho = pre ? 0 : 3, flipPort = pre ? 1 : -1;
  const lane = (n: Rect, s: number) => (s > 0 ? n.colX + W + lo : n.colX - lo);
  const port = (n: Rect, s: number, dy: number): Pt => [s > 0 ? n.x + n.w : n.x, n.y + n.h / 2 + dy * flipPort];
  const off = (n: Rect) => (n.big ? 7 : 5);
  const sa = side(A, B), sb = side(B, A);
  const la = lane(A, sa), lb = lane(B, sb);
  if (A.band === B.band) {
    // 같은 띠의 옆 구역: 위쪽 띠는 아래 통로로, 아래쪽 띠는 위 통로로
    const down = A.band === 0;
    const hy = (down ? L.hw[0] + 7 : L.hw[1] + 21) + ho;
    const pa = port(A, sa, (down ? 1 : -1) * off(A)), pb = port(B, sb, (down ? 1 : -1) * off(B));
    return [pa, [la, pa[1]], [la, hy], [lb, hy], [lb, pb[1]], pb];
  }
  const flip = A.band > B.band;
  const U = flip ? B : A, D = flip ? A : B;
  const su = flip ? sb : sa, sd = flip ? sa : sb, lu = flip ? lb : la, ld = flip ? la : lb;
  const pu = port(U, su, off(U)), pd = port(D, sd, -off(D));
  let pts: Pt[];
  if (D.band - U.band === 1) {
    const hy = (U.band === 0 ? L.hw[0] + 21 : L.hw[1] + 7) + ho;
    pts = [pu, [lu, pu[1]], [lu, hy], [ld, hy], [ld, pd[1]], pd];
  } else {
    const ox = L.through.reduce((best, x) => (Math.abs(x - ld) < Math.abs(best - ld) ? x : best), L.through[0]) + (pre ? 0 : 4);
    pts = [pu, [lu, pu[1]], [lu, L.hw[0] + 14 + ho], [ox, L.hw[0] + 14 + ho], [ox, L.hw[1] + 14 + ho], [ld, L.hw[1] + 14 + ho], [ld, pd[1]], pd];
  }
  return flip ? pts.slice().reverse() : pts;
}

export type Paths = { crossDash: string; crossSolid: string; crossHeads: string; tree: string; intra: string; intraHeads: string; hotHalo: string; hotDash: string; hotSolid: string; hotHeads: string };

// 지금 보이는 상자(접힌 세부 개념은 큰 개념으로 모은다)끼리의 선. active에 닿는 선은 진하게 그리고, 그 끝 상자를 linked로 알려 준다
export function drawEdges(data: MapData, L: Layout, expanded: Record<string, boolean>, active: Set<string>) {
  const { nodes, edges } = data;
  const vis = (id: string) => (nodes[id].big || expanded[nodes[id].parent!] ? id : nodes[id].parent!);
  const p: Paths = { crossDash: "", crossSolid: "", crossHeads: "", tree: "", intra: "", intraHeads: "", hotHalo: "", hotDash: "", hotSolid: "", hotHeads: "" };
  const linked = new Set<string>();
  const done = new Set<string>();
  const order = edges.filter((e) => e.pre).concat(edges.filter((e) => !e.pre));
  let count = 0;
  for (const e of order) {
    if (!nodes[e.from] || !nodes[e.to]) continue;
    const a = vis(e.from), b = vis(e.to);
    if (a === b || !L.rect[a] || !L.rect[b]) continue;
    const key = e.pre ? `${a}>${b}` : a < b ? `${a}~${b}` : `${b}~${a}`;
    if (done.has(key) || (!e.pre && (done.has(`${a}>${b}`) || done.has(`${b}>${a}`)))) continue;
    done.add(key);
    count++;
    const hot = active.has(a) || active.has(b);
    if (hot) {
      linked.add(a);
      linked.add(b);
    }
    const A = L.rect[a], B = L.rect[b];
    // 시안의 배치는 같은 구역의 선수 관계가 이웃한 큰 개념끼리만 있다고 본다. 그 밖의 선은 구역 밖 통로로 돌린다
    const intra = nodes[a].zone === nodes[b].zone && A.big && B.big && Math.abs(A.col - B.col) <= 1 && Math.abs(A.row - B.row) <= 1;
    const seg = path(intra ? routeIntra(L, a, b, expanded) : routeCross(L, a, b, e.pre), e.pre ? 5 : 0);
    if (hot) {
      p.hotHalo += seg.d;
      if (e.pre) {
        p.hotSolid += seg.d;
        p.hotHeads += seg.head;
      } else p.hotDash += seg.d;
    } else if (intra) {
      p.intra += seg.d;
      p.intraHeads += seg.head;
    } else if (e.pre) {
      p.crossSolid += seg.d;
      p.crossHeads += seg.head;
    } else p.crossDash += seg.d;
  }
  // 펼친 묶음의 가지
  for (const id of Object.keys(expanded)) {
    if (!expanded[id] || !L.rect[id] || !nodes[id].kids.length) continue;
    const B = L.rect[id], kids = nodes[id].kids;
    const last = L.rect[kids[kids.length - 1]];
    const x = B.x + 4;
    p.tree += "M" + x + " " + (B.y + H) + "V" + (last.y + last.h / 2);
    for (const k of kids) {
      const c = L.rect[k];
      p.tree += "M" + x + " " + (c.y + c.h / 2) + "H" + c.x;
    }
  }
  return { paths: p, linked, count };
}

// 글이 있는가: 세부 개념은 그 개념의 글, 큰 개념은 자기나 세부 개념 가운데 하나라도
export const hasPost = (data: MapData, id: string) => !!data.posts[id];
export const hasAny = (data: MapData, id: string) => hasPost(data, id) || data.nodes[id].kids.some((k) => hasPost(data, k));

// 처음 보기: 너비에 맞추고, 묶음을 더 펼쳐도 글자가 작아지지 않게 배율은 그대로 둔다
export function autoView(vw: number, vh: number) {
  const k = Math.min((vw - 64) / MW, (vh - 56) / BASE_H, 1.2);
  return { k, tx: (vw - MW * k) / 2, ty: Math.max(28, (vh - BASE_H * k) / 2) };
}

// Fit: 지금 펼쳐진 것까지 전부 보이게
export function fitAll(L: Layout, vw: number, vh: number, minK = 0.35) {
  const k = Math.max(minK, Math.min((vw - 64) / MW, (vh - 56) / L.mh, 1.2));
  return { k, tx: (vw - MW * k) / 2, ty: Math.max(28, (vh - L.mh * k) / 2) };
}
