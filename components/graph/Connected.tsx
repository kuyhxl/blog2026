"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate, postHref } from "@/lib/content/format";
import type { ConnectedNode } from "@/lib/content/graph";
import { GraphEngine, fitMap } from "./engine";
import GraphCanvas, { type CanvasEdge, type CanvasNode } from "./GraphCanvas";
import b from "./BrainMap.module.css";
import s from "./Connected.module.css";

// 글 본문의 FIG. 01: 이 글과 직접 이어진 글. 원본은 PostV2(왼쪽 창)와 PostV2M(접는 창). 움직임은 브레인 맵과 같은 규칙
const W = 270, H = 240, PAD = 16;
const MAP = fitMap(W, H);
const LABELS_MAX = 8; // 이웃이 이보다 많으면 이름표는 가리킨 점에만 단다

export type ConnectedData = { nodes: ConnectedNode[]; pairs: [number, number][]; self: number };

function useConnected(data: ConnectedData) {
  const [state] = useState(() => {
    const adj = data.nodes.map(() => new Set<number>());
    for (const [x, y] of data.pairs) {
      adj[x].add(y);
      adj[y].add(x);
    }
    const engine = new GraphEngine(data.nodes.map((n) => ({ x: n.px, y: n.py })), data.pairs, { W, H, pad: PAD, amp: 3.6, reach: 22 });
    return { engine, adj };
  });
  const [pointed, setPointed] = useState<number | null>(null);
  const { self } = data;
  // 보고 있는 점(hot)과 그 이웃(near), 그 밖(far). 아무것도 가리키지 않으면 이 글이 기준이다
  const focus = pointed ?? self;
  const many = data.nodes.length - 1 > LABELS_MAX;
  const nodes: CanvasNode[] = data.nodes.map((n, i) => {
    const hot = i === focus, near = state.adj[focus].has(i);
    return {
      key: n.slug, title: n.title, href: i === self || n.empty ? null : postHref(n.slug),
      label: i === self || (many && !hot) ? undefined : n.short, up: n.up, align: n.align,
      hot, near, far: pointed != null && !hot && !near, self: i === self, dim: n.empty && !hot,
    };
  });
  const edges: CanvasEdge[] = data.pairs.map(([x, y]) => ({ hot: x === focus || y === focus }));
  const picked = pointed != null && pointed !== self ? data.nodes[pointed] : null;
  return { engine: state.engine, nodes, edges, pointed, setPointed, picked, count: data.nodes.length - 1 };
}

const Stripes = () => <span className={b.stripes} aria-hidden="true" />;

// 데스크톱: 본문 왼쪽 단의 창
export function ConnectedSide({ data }: { data: ConnectedData }) {
  const g = useConnected(data);
  return (
    <>
      <div className={s.head}>
        <span className="mono">/Connected</span>
        <span className={`mono ${b.dimText}`}>({g.count})</span>
      </div>
      <figure className={s.side} aria-label="이 글과 직접 연결된 글">
        <div className={b.bar}>
          <span className={`mono ${b.no}`}>[ FIG. 01 ]</span>
          <Stripes />
          <Link className={`ghost ${b.iconBtn}`} href="/blog/" aria-label="전체 그래프 보기">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
              <path d="M7 1h4v4M5 11H1V7M11 1 7 5M1 11l4-4" />
            </svg>
          </Link>
        </div>
        <GraphCanvas engine={g.engine} map={MAP} kind="post" nodes={g.nodes} edges={g.edges} selected={g.pointed} onPoint={g.setPointed} className={s.canvas} />
        <figcaption className={b.cap}>
          {g.picked ? (
            <>
              <span className={b.capDate}>{formatDate(g.picked.date)}</span>
              <span className={b.capTitle}>{g.picked.title}</span>
            </>
          ) : (
            <span className={`${b.capTitle} ${b.dimText}`}>이 글과 직접 이어진 글 {g.count}개</span>
          )}
        </figcaption>
      </figure>
    </>
  );
}

// 좁은 화면: 본문 위에 접혀 있다가 누르면 펼쳐지는 창. 점을 고르면 아래에 그 글로 가는 줄이 뜬다
export function ConnectedFold({ data, className }: { data: ConnectedData; className?: string }) {
  const g = useConnected(data);
  const [open, setOpen] = useState(false);
  const [anim, setAnim] = useState(false);
  return (
    <figure className={[b.fold, open && b.open, anim && b.anim, className].filter(Boolean).join(" ")} aria-label="이 글과 직접 연결된 글">
      <button
        className={b.foldBtn}
        type="button"
        aria-expanded={open}
        aria-label={open ? "연결된 글 접기" : "연결된 글 펼치기"}
        onClick={() => {
          setOpen(!open);
          setAnim(true);
        }}
      >
        <span className={`mono ${b.no}`}>[ FIG. 01 ]</span>
        <span className={`mono ${b.no} ${b.dimText}`}>Connected ({g.count})</span>
        <Stripes />
        <span className={b.pm} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M2 7h10" />
            <path className={b.v} d="M7 2v10" />
          </svg>
        </span>
      </button>
      <div className={b.xp}>
        <div className={b.xpIn}>
          <div className={b.xpC}>
            <GraphCanvas engine={g.engine} map={MAP} kind="post" nodes={g.nodes} edges={g.edges} active={open} selected={g.pointed} onPoint={g.setPointed} className={s.foldCanvas} />
            <figcaption className={b.foldCap}>
              {g.picked && !g.picked.empty ? (
                <Link className={b.foldLink} href={postHref(g.picked.slug)}>
                  <span className={b.capDate}>{formatDate(g.picked.date)}</span>
                  <span className={b.foldTitle}>{g.picked.title}</span>
                  <span className={b.arrow} aria-hidden="true">
                    →
                  </span>
                </Link>
              ) : (
                <span className={s.foldNote}>{g.picked ? `${g.picked.title} · 아직 글이 없는 개념` : `이 글과 직접 이어진 글 ${g.count}개. 점을 누르면 제목이 보입니다`}</span>
              )}
            </figcaption>
          </div>
        </div>
      </div>
    </figure>
  );
}
