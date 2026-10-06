"use client";

import { useEffect, useRef, type RefObject } from "react";

// 겹쳐 뜨는 창(검색 창, 그래프 크게 보기)이 열려 있는 동안 창 밖의 화면을 막는다.
// - 맨 위 창 밖의 요소는 inert로 둔다. 포커스, 클릭, 화면 낭독기가 닿지 않는다(창이 겹치면 아래 창도 막힌다)
// - 창이 하나라도 열려 있으면 뒤 화면은 스크롤되지 않는다
// - onClose를 주면: 맨 위 창일 때 Tab은 창 안에서만 돌고, Esc는 포커스가 어디에 있든 창을 닫는다
//   (검색 창은 한글 입력 중의 Esc 처리 등이 있어서 이 둘을 스스로 한다)
// - 창이 어떤 까닭으로든 화면에서 사라지면(조상이 display: none 등) 그 창을 목록에서 빼고, onClose가 있으면 창을 닫는다.
//   보이지 않는 창이 뒤 화면만 막은 채 남지 않게 한다
// 막기와 스크롤 잠금은 창마다 따로 걸고 풀지 않고, 열린 창 목록 하나로 함께 다룬다.
// 창마다 이전 상태를 저장했다가 되돌리면, 창이 연 차례와 다르게 닫힐 때(아래 창이 먼저 사라짐) 잠금이 남는다
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

const stack: HTMLElement[] = []; // 열린 창. 끝이 맨 위
const ours = new Set<HTMLElement>(); // 여기서 inert로 만든 요소. 원래 막혀 있던 것은 건드리지 않는다
let overflow: string | null = null; // 잠그기 전 body의 overflow. 잠겨 있지 않으면 null

// 창에서 body까지 올라가며 지나는 요소의 형제
function outside(el: HTMLElement) {
  const out = new Set<HTMLElement>();
  for (let n: HTMLElement = el; n !== document.body && n.parentElement; n = n.parentElement)
    for (const sib of n.parentElement.children) if (sib !== n && sib instanceof HTMLElement) out.add(sib);
  return out;
}

// 열린 창 목록에 맞춰 막기와 스크롤 잠금을 다시 맞춘다
function settle() {
  const top = stack.at(-1);
  const want = top ? outside(top) : new Set<HTMLElement>();
  for (const el of ours)
    if (!want.has(el)) {
      el.inert = false;
      ours.delete(el);
    }
  for (const el of want)
    if (!el.inert) {
      el.inert = true;
      ours.add(el);
    }
  if (top && overflow === null) {
    overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else if (!top && overflow !== null) {
    document.body.style.overflow = overflow;
    overflow = null;
  }
}

// Tab은 창 안에서만, Esc는 어디서든 닫기. 이 창이 맨 위일 때만. 돌려주는 함수로 푼다
function holdKeys(el: HTMLElement, close: () => void) {
  const onKey = (e: KeyboardEvent) => {
    // 이 창 위에 다른 창(검색 창)이 떠 있으면 그 창이 키를 받는다
    if (stack.at(-1) !== el) return;
    if (e.key === "Escape" && !e.isComposing) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const all = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.tabIndex >= 0 && !x.hasAttribute("disabled") && x.getClientRects().length > 0);
      if (!all.length) return;
      const first = all[0], last = all[all.length - 1], now = document.activeElement;
      if (!now || !el.contains(now)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && now === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && now === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}

export function useModal(win: RefObject<HTMLElement | null>, onClose?: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const keys = !!onClose;

  useEffect(() => {
    const el = win.current;
    if (!el) return;
    stack.push(el);
    settle();
    const unhold = keys ? holdKeys(el, () => close.current?.()) : null;
    let freed = false;
    const free = () => {
      if (freed) return;
      freed = true;
      stack.splice(stack.indexOf(el), 1);
      settle();
      unhold?.();
    };
    const watch = new ResizeObserver(() => {
      if (el.getClientRects().length > 0) return;
      free();
      close.current?.();
    });
    watch.observe(el);
    return () => {
      watch.disconnect();
      free();
    };
  }, [win, keys]);
}
