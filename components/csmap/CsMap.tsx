"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatDate, postHref } from "@/lib/content/format";
import { ZONES, MW, autoView, drawEdges, fitAll, hasAny, hasPost, layout, type Layout, type MapData } from "@/lib/csmap/layout";
import { site } from "@/lib/site";
import Pine from "@/components/pine/Pine";
import EmailCopy from "@/components/EmailCopy";
import MapLayer from "./MapLayer";
import s from "./CsMap.module.css";

// Beauty of CS. 원본은 BeautyOfCSV2(데스크톱)와 BeautyOfCSV2M(720px 이하).
// 큰 개념을 누르면 세부 개념이 펼쳐지고, 개념을 고르면 요약이 열린다(데스크톱은 오른쪽 패널, 좁은 화면은 아래에서 올라오는 시트).
// 끌어서 옮기고, 휠이나 두 손가락으로 확대·축소한다
const PANEL = 360; // 요약 패널 너비
const NARROW = "(max-width: 720px)";
const MIN_K = 0.35, MAX_K = 2.4;
const M_MIN_K = 0.25; // 좁은 화면은 더 작게 볼 수 있다
const LEGEND = 44; // 좁은 화면에서 지도 맨 아래 범례 줄 높이
const SHEET_HALF = 0.46; // 시트의 기본 높이(화면 높이에 대한 비율)
const SHEET_MIN = 132; // 이보다 낮게 끌어 내리면 닫힌다
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type View = { k: number; tx: number; ty: number };

const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export default function CsMap({ data }: { data: MapData }) {
  const { nodes, posts } = data;
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [viewState, setView] = useState<View | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [sheet, setSheet] = useState<"half" | "full">("half");
  const [sheetH, setSheetH] = useState<number | null>(null);
  const [rise, setRise] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const [winH, setWinH] = useState(844);

  // 지도 칸의 크기를 잰다(요약 패널이 열리면 데스크톱에서는 좁아진다)
  useEffect(() => {
    const el = canvas.current!;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      setWinH(window.innerHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L: Layout = useMemo(() => layout(nodes, expanded), [nodes, expanded]);
  const vis = useCallback((id: string) => (nodes[id].big || expanded[nodes[id].parent!] ? id : nodes[id].parent!), [nodes, expanded]);
  const sel = selected ? vis(selected) : null;
  const hov = hover && L.rect[hover] ? hover : null;
  const drawn = useMemo(() => drawEdges(data, L, expanded, new Set([sel, hov].filter((x): x is string => !!x))), [data, L, expanded, sel, hov]);

  // 좁은 화면의 시트 높이: 기본(반), 끝까지 올렸을 때(제목 줄 바로 아래까지)
  const w = size?.w ?? MW + 64, h = size?.h ?? 740;
  const sizes = { full: Math.max(200, h + 1), half: Math.min(Math.max(200, h + 1), Math.round(winH * SHEET_HALF)) };
  const curSheetH = narrow && sel ? (sheetH ?? sizes[sheet]) : 0;
  // 지도에서 가려지지 않는 높이
  const clearH = (sheetPart: number) => (narrow ? Math.max(120, h - Math.max(LEGEND, sheetPart)) : h);
  const vh = clearH(sel ? Math.min(curSheetH, sizes.half) : 0);
  const centerOn = (id: string, k: number, vw: number, vh2: number, Lx = L): View => {
    const r = Lx.rect[id];
    return { k, tx: vw / 2 - (r.x + r.w / 2) * k, ty: vh2 / 2 - (r.y + r.h / 2) * k };
  };
  // 처음 보기: 데스크톱은 너비에 맞추고, 좁은 화면은 글자를 읽을 수 있는 배율로 운영체제 구역 가운데에서 시작한다
  const startView = (vw: number, vh2: number, Lx = L): View => (narrow ? centerOn(sel ?? "os-process", 1, vw, vh2, Lx) : autoView(vw, vh2));
  const view = viewState ?? startView(w, vh);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  // 고르기: 접힌 세부 개념이면 묶음을 펼치고, 화면 밖에 있으면 가운데로 데려온다. own이면 큰 개념 자신의 묶음도 펼친다(주소로 열 때)
  const select = (id: string, own = false) => {
    const par = nodes[id].parent;
    let ex = expanded;
    if (par && !ex[par]) ex = { ...ex, [par]: true };
    if (own && nodes[id].big && !ex[id]) ex = { ...ex, [id]: true };
    if (ex !== expanded) setExpanded(ex);
    const opening = !selected;
    setSelected(id);
    setHover(null);
    setSheetH(null);
    setRise(opening);
    const L2 = layout(nodes, ex), r = L2.rect[id];
    const vw2 = narrow ? w : w - (opening ? PANEL : 0);
    const vh2 = narrow ? clearH(sizes.half) : h;
    const v = viewState ?? startView(vw2, vh2, L2);
    const sx = v.tx + (r.x + r.w / 2) * v.k, sy = v.ty + (r.y + r.h / 2) * v.k;
    if (sx < 60 || sx > vw2 - 60 || sy < 40 || sy > vh2 - 40) setView(centerOn(id, v.k, vw2, vh2, L2));
    else if (!viewState) setView(v);
  };
  const close = useCallback(() => {
    setSelected(null);
    setHover(null);
    setSheetH(null);
  }, []);

  // 주소로 바로 열기: /cs/?node=<id>. 지도 칸의 크기를 처음 잰 뒤에 한 번 읽는다(가운데로 데려오려면 크기가 필요하다)
  const fromUrl = useRef(false);
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });
  useEffect(() => {
    if (!size || fromUrl.current) return;
    fromUrl.current = true;
    const q = new URLSearchParams(location.search);
    const id = q.get("node");
    if (id && nodes[id]) selectRef.current(id, true);
    else if (id != null) {
      // 지도에 없는 개념이면 주소에서 지운다
      q.delete("node");
      const qs = q.toString();
      window.history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
    }
  }, [size, nodes]);
  // 고른 개념을 주소에 남긴다. 닫으면 지운다. 주소를 처음 읽기 전에는 건드리지 않는다
  useEffect(() => {
    if (!fromUrl.current) return;
    const q = new URLSearchParams(location.search);
    if (selected) q.set("node", selected);
    else q.delete("node");
    const qs = q.toString();
    const next = location.pathname + (qs ? `?${qs}` : "") + location.hash;
    if (next !== location.pathname + location.search + location.hash) window.history.replaceState(null, "", next);
  }, [selected]);

  // ── 옮기기와 확대·축소(한 손가락이나 마우스로 끌고, 두 손가락이나 휠로 확대한다) ──
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ id: number; x: number; y: number; v: View; moved: boolean; onNode: boolean } | null>(null);
  const pinch = useRef<{ a: number; b: number; d: number; k: number; px: number; py: number } | null>(null);
  const panned = useRef(false);
  const panT = useRef<number | undefined>(undefined);
  const minK = narrow ? M_MIN_K : MIN_K;

  const onDown = (e: React.PointerEvent) => {
    const mouse = e.pointerType === "mouse";
    if (mouse && e.button !== 0) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    panned.current = false;
    if (pts.current.size === 1) {
      const onNode = !!(e.target as Element).closest("button, a");
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, v, moved: false, onNode };
      pinch.current = null;
      // 마우스로 빈 곳을 잡았을 때는 지도 밖으로 나가도 계속 따라오게 한다
      if (mouse && !onNode) e.currentTarget.setPointerCapture(e.pointerId);
    } else if (pts.current.size === 2) {
      // 두 손가락이 닿은 순간: 손가락 사이의 거리와, 그 가운데에 있는 지도 위의 점을 기억한다
      drag.current = null;
      const [[ia, a], [ib, b]] = [...pts.current.entries()];
      const box = canvas.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - box.left, my = (a.y + b.y) / 2 - box.top;
      pinch.current = { a: ia, b: ib, d: Math.hypot(b.x - a.x, b.y - a.y) || 1, k: v.k, px: (mx - v.tx) / v.k, py: (my - v.ty) / v.k };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    if (e.pointerType === "mouse" && e.buttons === 0) return onUp(e);
    p.x = e.clientX;
    p.y = e.clientY;
    const g = pinch.current;
    if (g) {
      const a = pts.current.get(g.a), b = pts.current.get(g.b);
      if (!a || !b) return;
      const box = canvas.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - box.left, my = (a.y + b.y) / 2 - box.top;
      const k = clamp(g.k * (Math.hypot(b.x - a.x, b.y - a.y) / g.d), minK, MAX_K);
      panned.current = true;
      // 처음 두 손가락 사이에 있던 지도 위의 점이 지금의 손가락 사이에 오게 한다
      setView({ k, tx: mx - g.px * k, ty: my - g.py * k });
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < (e.pointerType === "mouse" ? 4 : 6)) return;
    d.moved = true;
    panned.current = true;
    setView({ k: d.v.k, tx: d.v.tx + dx, ty: d.v.ty + dy });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    // 옮기거나 확대하다가 뗀 직후에 따라오는 누름은 치지 않는다
    if (panned.current) {
      window.clearTimeout(panT.current);
      panT.current = window.setTimeout(() => (panned.current = false), 350);
    }
    const d = drag.current;
    if (pinch.current) {
      // 손가락 하나가 남으면 그 손가락으로 이어서 옮긴다
      pinch.current = null;
      const left = [...pts.current.entries()][0];
      if (left) drag.current = { id: left[0], x: left[1].x, y: left[1].y, v: viewRef.current, moved: true, onNode: true };
      return;
    }
    drag.current = null;
    // 빈 곳을 가볍게 누르면 고른 것을 푼다
    if (d && !d.moved && !d.onNode && selected) close();
  };

  // 휠 확대·축소는 기본 스크롤을 막아야 해서 직접 건다
  useEffect(() => {
    const el = canvas.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current, box = el.getBoundingClientRect();
      const mx = e.clientX - box.left, my = e.clientY - box.top;
      const k = clamp(v.k * Math.exp(-e.deltaY * 0.0016), minK, MAX_K);
      setView({ k, tx: mx - (mx - v.tx) * (k / v.k), ty: my - (my - v.ty) * (k / v.k) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minK]);

  // 요약을 닫는 Esc
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  const zoom = (f: number) => () => {
    const v = view, cx = w / 2, cy = vh / 2;
    const k = clamp(v.k * f, minK, MAX_K);
    setView({ k, tx: cx - (cx - v.tx) * (k / v.k), ty: cy - (cy - v.ty) * (k / v.k) });
  };
  const fit = () => {
    if (!narrow) return setView(fitAll(L, w, h));
    const k = clamp(Math.min((w - 24) / MW, (vh - 24) / L.mh), M_MIN_K, 1.2);
    setView({ k, tx: (w - MW * k) / 2, ty: Math.max(12, (vh - L.mh * k) / 2) });
  };

  const onNode = (id: string) => {
    if (panned.current) return;
    if (!nodes[id].big) return select(id);
    // 큰 개념: 펼치거나 접고, 그 개념을 고른다
    setExpanded((ex) => ({ ...ex, [id]: !ex[id] }));
    setRise(!selected);
    setSelected(id);
    setHover(null);
    setSheetH(null);
  };

  // ── 시트의 손잡이 줄: 위아래로 끌어 높이를 바꾼다 ──
  const grip = useRef<{ id: number; y: number; h: number; moved: boolean } | null>(null);
  const gripDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("button")) return;
    grip.current = { id: e.pointerId, y: e.clientY, h: curSheetH, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const gripMove = (e: React.PointerEvent) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.abs(dy) < 4) return;
    g.moved = true;
    setSheetH(clamp(g.h - dy, 60, sizes.full));
  };
  const gripUp = (e: React.PointerEvent) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    grip.current = null;
    if (!g.moved) return;
    const hNow = sheetH ?? curSheetH;
    if (hNow < SHEET_MIN) {
      close();
      setSheet("half");
    } else {
      setSheetH(null);
      setSheet(hNow > (sizes.half + sizes.full) / 2 ? "full" : "half");
    }
  };

  const postCount = Object.keys(posts).length, nodeCount = Object.keys(nodes).length;
  const gs = 16 * view.k * (view.k < 0.6 ? 2 : 1);
  // 목록의 개념에 마우스를 올리면 지도에서 그 상자를 강조한다. 접혀 있으면 그 묶음의 큰 개념을
  const panel = sel ? <NodePanel data={data} id={sel} onPick={select} onHover={(x) => setHover(x ? vis(x) : null)} /> : null;
  const full = sheetH == null ? sheet === "full" : sheetH >= sizes.full - 2;

  return (
    <main className={s.screen}>
      <div className={s.titleBar}>
        <Pine place="bar" />
        <h1 className={s.title}>
          <span>Beauty of CS</span>
          <span className={s.count}>
            ({postCount}/{nodeCount})
          </span>
        </h1>
        <p className={s.hint}>큰 개념을 누르면 세부 개념이 펼쳐지고, 개념을 고르면 오른쪽에 요약이 열립니다.</p>
      </div>

      <div className={s.body}>
        <div className={s.region}>
          <div
            ref={canvas}
            className={s.canvas}
            style={{ backgroundSize: `${gs}px ${gs}px`, backgroundPosition: `${view.tx}px ${view.ty}px` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div className={s.layer} style={{ width: MW, height: L.mh, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`, visibility: size ? "visible" : "hidden" }}>
              <MapLayer data={data} L={L} paths={drawn.paths} expanded={expanded} sel={sel} linked={drawn.linked} onNode={onNode} onHover={setHover} />
            </div>
          </div>

          {/* 좁은 화면: 지도 위에 뜨는 확대·축소와 맨 아래 범례 */}
          <div className={s.mZoom} role="group" aria-label="확대와 축소">
            <button className="ghost" type="button" aria-label="축소" onClick={zoom(1 / 1.2)}>
              −
            </button>
            <button className="ghost" type="button" aria-label="확대" onClick={zoom(1.2)}>
              +
            </button>
            <button className="mono ghost" type="button" aria-label="전체 보기" onClick={fit}>
              Fit
            </button>
          </div>
          <div className={s.mLegend}>
            <Legend />
          </div>

          {narrow && sel && (
            <aside className={[s.sheet, sheetH != null && s.drag, rise && s.rise].filter(Boolean).join(" ")} style={{ height: curSheetH }} aria-label="개념 요약">
              <div className={s.grip} onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp}>
                <span className={`mono ${s.no}`}>[ Node ]</span>
                <span className={s.stripes} aria-hidden="true" />
                <button
                  className={`ghost ${s.sheetBtn}`}
                  type="button"
                  aria-label={full ? "요약 줄이기" : "요약 크게 보기"}
                  aria-expanded={full}
                  onClick={() => {
                    setSheet(full ? "half" : "full");
                    setSheetH(null);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                    <path d={full ? "M2 5l5 5 5-5" : "M2 9l5-5 5 5"} />
                  </svg>
                </button>
                <button className={`ghost ${s.sheetBtn}`} type="button" aria-label="요약 닫기" onClick={close}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
              {panel}
            </aside>
          )}
        </div>

        {!narrow && sel && (
          <aside className={s.panel} aria-label="개념 요약">
            <div className={s.panelBar}>
              <span className={`mono ${s.no}`}>[ Node ]</span>
              <span className={s.stripes} aria-hidden="true" />
              <button className={`ghost ${s.closeBtn}`} type="button" aria-label="요약 닫기" onClick={close}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            </div>
            {panel}
          </aside>
        )}
      </div>

      {/* 데스크톱 아래 줄: 범례, 확대·축소, 그리고 이 화면의 푸터 */}
      <div className={s.bottom}>
        <Legend />
        <div className={s.bottomRight}>
          <div className={s.zoom} role="group" aria-label="확대와 축소">
            <button className="ghost" type="button" aria-label="축소" onClick={zoom(1 / 1.2)}>
              −
            </button>
            <span className={s.zoomPct}>{Math.round(view.k * 100)}%</span>
            <button className="ghost" type="button" aria-label="확대" onClick={zoom(1.2)}>
              +
            </button>
            <button className={`mono ghost ${s.fit}`} type="button" onClick={fit}>
              Fit
            </button>
          </div>
          <span className={s.copy}>
            <span className="mono">© 2026</span>
            <span>{site.name}</span>
          </span>
          <a className="mono lk" href={site.github}>
            GitHub ↗
          </a>
          <a className="mono lk" href={site.feed}>
            RSS
          </a>
          <EmailCopy />
        </div>
      </div>
    </main>
  );
}

function Legend() {
  return (
    <div className={s.legend}>
      <span className={s.lg}>
        <span className={`${s.lgSq} ${s.lgOn}`} aria-hidden="true" />
        <span>글 있음</span>
      </span>
      <span className={s.lg}>
        <span className={s.lgSq} aria-hidden="true" />
        <span>작성 전</span>
      </span>
      <span className={s.lg}>
        <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true">
          <path d="M0 4H22" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M21 0.8 28 4 21 7.2Z" fill="currentColor" />
        </svg>
        <span>선수 지식</span>
      </span>
      <span className={s.lg}>
        <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true">
          <path d="M0 4H28" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        </svg>
        <span>연관 개념</span>
      </span>
    </div>
  );
}

// 요약 패널의 내용. 원본은 BeautyOfCSV2의 aside(개념 요약)
function NodePanel({ data, id, onPick, onHover }: { data: MapData; id: string; onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  const { nodes, edges, posts } = data;
  const n = nodes[id];
  const zone = ZONES.find((z) => z.id === n.zone);
  const post = posts[id];
  type Item = { id: string; note: string; plain?: boolean };
  const before: Item[] = [], after: Item[] = [], related: Item[] = [];
  for (const e of edges) {
    if (e.from !== id && e.to !== id) continue;
    const other = e.from === id ? e.to : e.from;
    if (!e.pre) related.push({ id: other, note: e.note });
    else if (e.to === id) before.push({ id: other, note: e.note });
    else after.push({ id: other, note: e.note });
  }
  const groups: { sym: string; label: string; items: Item[] }[] = [];
  if (n.big) groups.push({ sym: "└", label: "세부 개념", items: n.kids.map((k) => ({ id: k, note: "", plain: true })) });
  if (before.length) groups.push({ sym: "←", label: "선수 지식", items: before });
  if (after.length) groups.push({ sym: "→", label: "다음 개념", items: after });
  if (related.length) groups.push({ sym: "··", label: "연관 개념", items: related });
  const withPost = n.kids.filter((k) => hasPost(data, k)).length;
  const marked = !!post || (n.big && withPost > 0);
  const path = (zone?.name ?? n.zone) + (n.parent ? " › " + nodes[n.parent].title : "");

  return (
    <>
      <div className={s.panelBody}>
        <div className={s.path}>
          <span className="mono">[ {zone?.code ?? n.zone} ]</span>
          <span>{path}</span>
        </div>
        <h2 className={s.nodeTitle}>{n.title}</h2>
        <div className={s.status}>
          <span className={`${s.lgSq} ${marked ? s.lgOn : ""}`} aria-hidden="true" />
          <span>{post ? `글 있음 · ${formatDate(post.date)}` : n.big ? `세부 개념 ${n.kids.length}개 · 글 ${withPost}개` : "작성 전"}</span>
        </div>
        <p className={`${s.summary} ${post ? "" : s.summaryDim}`}>
          {post ? post.summary : n.big ? "세부 개념을 고르면 요약과 연결된 개념을 볼 수 있습니다." : "이 개념의 글은 아직 쓰지 않았습니다. 아래에 연결된 개념부터 읽어 보세요."}
        </p>
        {groups.map((g) => (
          <section key={g.label} className={s.group}>
            <div className={s.groupHead}>
              <span className={s.groupName}>
                <span className={s.sym}>{g.sym}</span>
                <span>{g.label}</span>
              </span>
              <span className={s.groupN}>({g.items.length})</span>
            </div>
            {g.items.map((it) => {
              const m = nodes[it.id];
              const f = m.big ? hasAny(data, it.id) : hasPost(data, it.id);
              const where = it.plain ? "" : (ZONES.find((z) => z.id === m.zone)?.code ?? m.zone) + (m.parent ? " · " + nodes[m.parent].title : "");
              return (
                <button
                  key={it.id}
                  type="button"
                  className={`${s.item} ${f ? s.itemOn : ""}`}
                  onClick={() => onPick(it.id)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && onHover(it.id)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
                >
                  <span className={`${s.lgSq} ${s.itemSq} ${f ? s.lgOn : ""}`} aria-hidden="true" />
                  <span className={s.itemBody}>
                    <span className={s.itemTop}>
                      <span className={s.itemTitle}>{m.title}</span>
                      <span className={s.itemWhere}>{where}</span>
                    </span>
                    {it.note && <span className={s.itemNote}>{it.note}</span>}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <div className={s.panelFoot}>
        {post ? (
          <>
            <p className={s.postTitle}>{post.title}</p>
            <Link className={`fill ${s.read}`} href={postHref(post.slug)}>
              <span>전체 글 읽기</span>
              <span className={s.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </>
        ) : (
          <div className={s.noPost}>{n.big ? "세부 개념을 고르면 글로 이어집니다" : "아직 글이 없습니다"}</div>
        )}
      </div>
    </>
  );
}
