"use client";

import { useEffect, useRef } from "react";
import s from "./CursorFx.module.css";

// 커서 효과(모든 화면 공통). 원본은 각 화면 스크립트의 FX_ 값과 fxTrail, fxTap.
// 화면 위에 덧그리는 층이라 누르는 것을 가로채지 않고, 기본 커서도 그대로 둔다.
// 층에 미리 놓아 둔 테두리 네모를 돌려 쓰고, 자리와 크기 변화만 스크립트가 정한다
const FX_CELL = 14; // 잔상이 찍히는 간격이자 자리를 맞추는 격자(px)
// 잔상: 20px로 찍힌 뒤 4px까지 일정한 속도로 작아지며 0.8초 동안 사라진다. 찍힌 순간이 가장 진하다(55%)
const FX_TRAIL = { from: 20, to: 4, ms: 800, alpha: 0.55, ease: "linear" };
// 누름: 4px에서 24px까지 퍼지며 0.65초 동안 사라진다. 처음에 빠르게 커지고 끝으로 갈수록 느려진다
const FX_PRESS = { from: 4, to: 24, ms: 650, alpha: 0.8, ease: "cubic-bezier(.215,.61,.355,1)" };
const FX_TRAILS = 120, FX_PRESSES = 6; // 한꺼번에 떠 있을 수 있는 네모 수(잔상, 누름)

type Kind = typeof FX_TRAIL;

export default function CursorFx() {
  const layer = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = layer.current!, cursor = dot.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const anims: (Animation[] | undefined)[] = [];
    let at: { x: number; y: number } | null = null; // 마지막으로 잔상을 찍은 자리(화면 좌표, 격자에 맞추기 전)
    let gx = NaN, gy = NaN, n = 0, k = 0;
    let ox = 0, oy = 0; // 층의 왼쪽 위가 문서의 어디인지

    const on = () => !reduce.matches;
    const hide = () => {
      at = null;
      cursor.style.visibility = "hidden";
    };
    // 층의 왼쪽 위가 문서의 어디인지. 네모는 문서에 찍히므로 스크롤하면 글과 함께 움직인다
    const origin = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ox = r.left + (e.pageX - e.clientX);
      oy = r.top + (e.pageY - e.clientY);
    };
    // i번째 네모를 (x, y)에 중심을 두고 from → to 크기로 바꾸면서 지운다. 테두리 굵기는 1px 그대로다
    const stamp = (i: number, x: number, y: number, kind: Kind) => {
      const sq = el.children[i] as HTMLElement | undefined;
      if (!sq?.animate) return;
      anims[i]?.forEach((a) => a.cancel());
      const a = kind.from / 2, b = kind.to / 2;
      anims[i] = [
        sq.animate(
          [
            { left: x - a + "px", top: y - a + "px", width: kind.from + "px", height: kind.from + "px" },
            { left: x - b + "px", top: y - b + "px", width: kind.to + "px", height: kind.to + "px" },
          ],
          { duration: kind.ms, easing: kind.ease },
        ),
        sq.animate([{ opacity: kind.alpha }, { opacity: 0 }], { duration: kind.ms }),
      ];
    };
    // 가장 가까운 격자점에 잔상 하나. 바로 앞에 찍은 자리와 같으면 건너뛴다
    const put = (x: number, y: number) => {
      const px = Math.round(x / FX_CELL) * FX_CELL, py = Math.round(y / FX_CELL) * FX_CELL;
      if (px === gx && py === gy) return;
      gx = px;
      gy = py;
      n = (n + 1) % FX_TRAILS;
      stamp(n, px, py, FX_TRAIL);
    };

    // 마우스가 움직일 때: 커서 아래 네모를 옮기고, 지나간 길을 14px마다 끊어 잔상을 찍는다.
    // 터치와 펜은 스크롤과 겹치므로 잔상을 남기지 않는다
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !on()) return hide();
      const x = e.clientX, y = e.clientY;
      cursor.style.left = x + "px";
      cursor.style.top = y + "px";
      cursor.style.visibility = "visible";
      const last = at;
      if (!last) {
        origin(e);
        at = { x, y };
        return;
      }
      const dx = x - last.x, dy = y - last.y, dist = Math.hypot(dx, dy);
      if (dist < FX_CELL) return;
      // 화면 좌표를 층 안의 좌표로 옮길 때 더하는 값(지금의 스크롤 − 층의 자리)
      const sx = e.pageX - x - ox, sy = e.pageY - y - oy;
      // 한 번에 아주 멀리 건너뛰었으면 사이를 잇지 않고 그 자리에만 찍는다
      if (dist > FX_CELL * 40) {
        at = { x, y };
        put(x + sx, y + sy);
        return;
      }
      const steps = Math.floor(dist / FX_CELL), ux = (dx / dist) * FX_CELL, uy = (dy / dist) * FX_CELL;
      for (let i = 1; i <= steps; i++) put(last.x + ux * i + sx, last.y + uy * i + sy);
      at = { x: last.x + ux * steps, y: last.y + uy * steps };
    };
    // 누를 때(마우스 왼쪽 버튼, 터치, 펜): 격자에 맞추지 않고 누른 자리 그대로에서 네모 하나가 퍼진다
    const onDown = (e: PointerEvent) => {
      if (!on() || !e.isPrimary || e.button > 0) return;
      if (e.pointerType !== "mouse") hide();
      origin(e);
      k = (k + 1) % FX_PRESSES;
      stamp(FX_TRAILS + k, Math.round(e.pageX - ox), Math.round(e.pageY - oy), FX_PRESS);
    };

    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    document.documentElement.addEventListener("pointerleave", hide);
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerdown", onDown, { capture: true });
      document.documentElement.removeEventListener("pointerleave", hide);
      anims.forEach((a) => a?.forEach((x) => x.cancel()));
    };
  }, []);

  return (
    <>
      <div ref={layer} className={s.fx} aria-hidden="true">
        {Array.from({ length: FX_TRAILS + FX_PRESSES }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <i ref={dot} className={s.dot} aria-hidden="true" />
    </>
  );
}
