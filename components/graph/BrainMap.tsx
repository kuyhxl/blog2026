"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate, postHref } from "@/lib/content/format";
import type { Graph } from "@/lib/content/graph";
import { GraphEngine, fitMap, largeMap } from "./engine";
import GraphCanvas, { type CanvasEdge, type CanvasNode } from "./GraphCanvas";
import { useModal } from "../useModal";
import s from "./BrainMap.module.css";

// 브레인 맵: 모든 공개 노트의 링크 그래프. 원본은 MainV2(작은 창, 크게 보기)와 MainV2M(접는 창)
// 계산 좌표는 데스크톱 작은 창의 크기(270×200)다
const W = 270, H = 200, PAD = 12;
const SMALL = fitMap(W, H);
const LARGE = largeMap(W, H, PAD);

export type Pointed = { i: number; via: "row" | "node" } | null;

export type BrainMapState = {
  engine: GraphEngine;
  graph: Graph;
  pairs: [number, number][];
  adj: Set<number>[];
};

// 브레인 맵 하나에 엔진 하나. 작은 창, 크게 본 창, 좁은 화면의 창이 같은 점을 그린다
export function useBrainMap(graph: Graph): BrainMapState {
  const [state] = useState(() => {
    const seen = new Set<string>();
    const pairs: [number, number][] = [];
    for (const [a, b] of graph.edges) {
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(k) || a === b) continue;
      seen.add(k);
      pairs.push([a, b]);
    }
    const adj = graph.nodes.map(() => new Set<number>());
    for (const [a, b] of pairs) {
      adj[a].add(b);
      adj[b].add(a);
    }
    // 점: 작은 창에 여백을 두고 차도록 맞춘 자리가 제자리다
    const homes = graph.nodes.map((n) => ({ x: (0.07 + n.x * 0.86) * W, y: (0.09 + n.y * 0.82) * H }));
    return { engine: new GraphEngine(homes, pairs, { W, H, pad: PAD, amp: 4 }), graph, pairs, adj };
  });
  return state;
}

type Props = {
  map: BrainMapState;
  visible: Set<string>; // 필터에 걸린 글
  filtered: boolean;
  active: number | null; // 보고 있는 점: 가리킨 점, 없으면 마지막으로 펼친 행의 글
  pointed: Pointed;
  onPoint: (p: Pointed) => void;
};

function useView({ map, visible, active, pointed }: Props, labels: boolean) {
  const { graph, pairs, adj } = map;
  // 점을 직접 가리켰을 때만 그 밖의 점과 선을 흐리게 한다
  const fade = pointed?.via === "node";
  const ok = (i: number) => !graph.nodes[i].empty && visible.has(graph.nodes[i].slug);
  const nodes: CanvasNode[] = graph.nodes.map((n, i) => {
    const hot = i === active, near = active != null && adj[active].has(i);
    return {
      key: n.slug, title: n.title, href: n.empty ? null : postHref(n.slug), label: labels ? n.short : undefined,
      hot, near, far: fade && !hot && !near, dim: !ok(i),
    };
  });
  const edges: CanvasEdge[] = pairs.map(([a, b]) => ({ hot: active != null && (a === active || b === active), faint: fade || !(ok(a) && ok(b)) }));
  return { nodes, edges };
}

function stat({ map, visible, filtered }: Props) {
  const n = map.graph.nodes.length;
  const shown = map.graph.nodes.filter((x) => !x.empty && visible.has(x.slug)).length;
  return `${filtered ? `${shown} / ${n}` : n} nodes · ${map.pairs.length} links`;
}

const Stripes = ({ tall }: { tall?: boolean }) => <span className={`${s.stripes} ${tall ? s.tall : ""}`} aria-hidden="true" />;

// 데스크톱: 필터 창 아래의 작은 창과 크게 보기
export function BrainMapSide(props: Props) {
  const { map, active, onPoint } = props;
  const small = useView(props, false);
  const large = useView(props, true);
  const [open, setOpen] = useState(false);
  const openBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const act = active != null ? map.graph.nodes[active] : null;
  const point = (i: number | null) => onPoint(i == null ? null : { i, via: "node" });

  // 열면 닫기 버튼으로 포커스를 옮기고, 닫으면 크게 보기 버튼으로 돌려준다
  useEffect(() => {
    if (open) closeBtn.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    onPoint(null);
    setTimeout(() => openBtn.current?.focus({ preventScroll: true }), 0);
  };
  // 화면이 좁아지면(900px 이하, PostList.module.css에서 이 창이 사라지는 폭) 크게 보기도 닫는다. 좁은 화면은 접는 창(BrainMapFold)을 쓴다
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = () => mq.matches && closeRef.current();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  return (
    <figure className={s.side} aria-label="글 연결 그래프">
      <div className={s.bar}>
        <span className={`mono ${s.no}`}>[ FIG. 01 ]</span>
        <Stripes />
        <button ref={openBtn} className={`ghost ${s.iconBtn}`} type="button" aria-label="그래프 크게 보기" onClick={() => setOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
            <path d="M7 1h4v4M5 11H1V7M11 1 7 5M1 11l4-4" />
          </svg>
        </button>
      </div>
      <GraphCanvas engine={map.engine} map={SMALL} kind="list" {...small} selected={props.pointed?.i ?? null} onPoint={point} focusable={false} className={s.small} />
      <figcaption className={s.cap}>
        {act ? (
          <>
            <span className={s.capDate}>{formatDate(act.date)}</span>
            <span className={s.capTitle}>{act.title}</span>
          </>
        ) : (
          <span className={`mono ${s.capStat}`}>{stat(props)}</span>
        )}
      </figcaption>

      {open && (
        <LargeWindow onClose={close}>
          <div className={s.winBar}>
            <span className="mono">[ FIG. 01 ]</span>
            <span className={`mono ${s.dimText}`}>Post graph</span>
            <Stripes tall />
            <button ref={closeBtn} className={`ghost ${s.closeBtn}`} type="button" aria-label="그래프 닫기" onClick={close}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>
          <GraphCanvas engine={map.engine} map={LARGE} kind="large" {...large} selected={props.pointed?.i ?? null} onPoint={point} className={s.big} />
          <figcaption className={s.winCap}>
            <span className={`mono ${s.dimText}`}>{stat(props)}</span>
            {act && (
              <span className={s.winAct}>
                <span className={s.sq} aria-hidden="true" />
                <span className={s.winDate}>{formatDate(act.date)}</span>
                <span className={s.winTitle}>{act.title}</span>
              </span>
            )}
          </figcaption>
        </LargeWindow>
      )}
    </figure>
  );
}

// 크게 보기 창. 열려 있는 동안 뒤 화면을 막고, Tab은 창 안에서만 돌며, Esc는 포커스가 어디 있든 닫는다.
// 사이드바 안이 아니라 body 끝에 그린다. 사이드바가 숨겨져도 창이 함께 숨어 뒤 화면만 막힌 채 남지 않게 한다
function LargeWindow({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const win = useRef<HTMLElement>(null);
  useModal(win, onClose);
  return createPortal(
    <div className={s.veil} onClick={onClose}>
      <figure ref={win} className={s.win} role="dialog" aria-modal="true" aria-label="글 연결 그래프" onClick={(e) => e.stopPropagation()}>
        {children}
      </figure>
    </div>,
    document.body,
  );
}

// 좁은 화면: 접혀 있다가 누르면 펼쳐지는 창. 점을 고르면 아래에 그 글로 가는 줄이 뜬다
export function BrainMapFold(props: Props) {
  const { map, pointed, onPoint } = props;
  const view = useView(props, false);
  const [open, setOpen] = useState(false);
  const [anim, setAnim] = useState(false);
  const picked = pointed ? map.graph.nodes[pointed.i] : null;
  return (
    <figure className={[s.fold, open && s.open, anim && s.anim].filter(Boolean).join(" ")} aria-label="글 연결 그래프">
      <button
        className={s.foldBtn}
        type="button"
        aria-expanded={open}
        aria-label={open ? "그래프 접기" : "그래프 펼치기"}
        onClick={() => {
          setOpen(!open);
          setAnim(true);
        }}
      >
        <span className={`mono ${s.no}`}>[ FIG. 01 ]</span>
        <span className={`mono ${s.no} ${s.dimText}`}>Post graph</span>
        <Stripes />
        <span className={s.pm} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M2 7h10" />
            <path className={s.v} d="M7 2v10" />
          </svg>
        </span>
      </button>
      <div className={s.xp}>
        <div className={s.xpIn}>
          <div className={s.xpC}>
            <GraphCanvas engine={map.engine} map={SMALL} kind="list" {...view} active={open} selected={pointed?.i ?? null} onPoint={(i) => onPoint(i == null ? null : { i, via: "node" })} className={s.foldCanvas} />
            <figcaption className={s.foldCap}>
              {picked && !picked.empty ? (
                <a className={s.foldLink} href={postHref(picked.slug)}>
                  <span className={s.capDate}>{formatDate(picked.date)}</span>
                  <span className={s.foldTitle}>{picked.title}</span>
                  <span className={s.arrow} aria-hidden="true">
                    →
                  </span>
                </a>
              ) : (
                <span className={`mono ${s.capStat}`}>{picked ? `${picked.title} · 아직 글이 없는 개념` : stat(props)}</span>
              )}
            </figcaption>
          </div>
        </div>
      </div>
    </figure>
  );
}
