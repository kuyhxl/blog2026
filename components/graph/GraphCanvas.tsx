"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { GraphEngine, ViewMap } from "./engine";
import s from "./graph.module.css";

export type CanvasNode = {
  key: string;
  title: string;
  href: string | null; // 글 페이지가 없는 점(빈 노드, 이 글 자신)은 null
  label?: string;
  up?: boolean; // 이름표를 점 위에 단다
  align?: "start" | "center" | "end"; // 이름표를 점의 어느 쪽에 맞출지(창 가장자리의 점)
  hot?: boolean;
  near?: boolean;
  far?: boolean;
  dim?: boolean;
  self?: boolean;
};
export type CanvasEdge = { hot?: boolean; faint?: boolean };

type Props = {
  engine: GraphEngine;
  map: ViewMap; // 바뀌지 않는 값을 넘긴다
  kind: "list" | "large" | "post";
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selected: number | null; // 지금 고른(가리킨) 점
  onPoint: (i: number | null) => void; // 점을 가리키거나 고를 때. null이면 푼다
  focusable?: boolean;
  active?: boolean; // 접는 창이 접혀 있으면 false. 그동안 계산을 멈춘다
  className?: string;
  style?: CSSProperties;
};

// 점(.gn)과 선(.gl)을 그리고 누름·끌기를 엔진에 넘긴다. 자리는 엔진이 매 프레임 직접 옮긴다.
// 마우스는 올리면 가리키고 누르면 글로 간다. 손가락과 펜은 한 번 누르면 고르고, 고른 점을 다시 누르면 글로 간다(MainV2M·PostV2M)
export default function GraphCanvas({ engine, map, kind, nodes, edges, selected, onPoint, focusable = true, active = true, className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const down = useRef<{ touch: boolean; was: boolean }>({ touch: false, was: false });

  const activeRef = useRef(active);
  useEffect(() => engine.attach(ref.current!, map, activeRef.current), [engine, map]);
  useEffect(() => {
    activeRef.current = active;
    engine.setActive(ref.current!, active);
  }, [engine, active]);

  // 처음 그릴 때의 자리(계산 좌표 그대로). 붙는 즉시 엔진이 창 크기에 맞춰 다시 놓는다
  const home = (i: number) => engine.sim[i];

  return (
    <div
      ref={ref}
      className={[s.fig, s[kind], className].filter(Boolean).join(" ")}
      style={style}
      onPointerMove={(e) => engine.move(e.nativeEvent)}
      onPointerUp={(e) => engine.release(e.nativeEvent)}
      onPointerCancel={(e) => engine.release(e.nativeEvent)}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !engine.holding) onPoint(null);
      }}
      onClick={(e) => {
        // 빈 곳을 누르면 고른 점을 푼다
        if (!(e.target as Element).closest("[data-gn]")) onPoint(null);
      }}
    >
      <div className={s.layer}>
        <svg className={s.lines} aria-hidden="true">
          {edges.map((e, i) => {
            const l = engine.links[i];
            return <line key={i} data-gl={i} className={[s.gl, e.hot && s.hot, e.faint && s.faint].filter(Boolean).join(" ")} x1={l?.a.x ?? 0} y1={l?.a.y ?? 0} x2={l?.b.x ?? 0} y2={l?.b.y ?? 0} />;
          })}
        </svg>
        {nodes.map((n, i) => {
          const cls = [s.gn, n.hot && s.hot, n.near && s.near, n.far && s.far, n.dim && s.dim, n.self && s.self].filter(Boolean).join(" ");
          const inner = (
            <>
              <span className={s.hit}>
                <span className={s.sq} />
              </span>
              {n.label && (
                <span className={[s.lb, n.up && s.up, n.align === "start" && s.start, n.align === "end" && s.end].filter(Boolean).join(" ")} aria-hidden="true">
                  {n.label}
                </span>
              )}
            </>
          );
          const common = {
            "data-gn": i,
            className: cls,
            style: { transform: `translate(${home(i).x}px,${home(i).y}px)` },
            draggable: false,
            onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
              down.current = { touch: e.pointerType !== "mouse", was: selected === i };
              engine.grab(i, e.nativeEvent, ref.current!, e.currentTarget);
              if (e.pointerType === "mouse") e.preventDefault();
            },
            onPointerEnter: (e: React.PointerEvent) => {
              if (e.pointerType === "mouse" && !engine.holding) onPoint(i);
            },
            onFocus: () => onPoint(i),
            onBlur: () => onPoint(null),
          };
          if (!n.href)
            return (
              <span key={n.key} {...common} onClick={() => onPoint(i)}>
                {inner}
              </span>
            );
          return (
            <a
              key={n.key}
              {...common}
              href={n.href}
              aria-label={n.title}
              tabIndex={focusable ? undefined : -1}
              onClick={(e) => {
                // 끌다가 놓은 직후에는 이동하지 않는다. 손가락은 처음 누르면 고르기만 한다
                if (engine.dropped || (down.current.touch && !down.current.was)) {
                  e.preventDefault();
                  if (!engine.dropped) onPoint(i);
                }
              }}
            >
              {inner}
            </a>
          );
        })}
      </div>
    </div>
  );
}
