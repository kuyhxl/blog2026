"use client";

import { useEffect, useRef, type RefObject } from "react";

// 겹쳐 뜨는 창(검색 창, 그래프 크게 보기)이 열려 있는 동안 창 밖의 화면을 막는다.
// - 창 밖의 요소는 inert로 둔다. 포커스, 클릭, 화면 낭독기가 닿지 않는다
// - onClose를 주면: Tab은 창 안에서만 돌고, Esc는 포커스가 어디에 있든 창을 닫고, 뒤 화면은 스크롤되지 않는다
//   (검색 창은 한글 입력 중의 Esc 처리 등이 있어서 이 셋을 스스로 한다)
// - 창이 어떤 까닭으로든 화면에서 사라지면(조상이 display: none 등) 막은 것을 풀고, onClose가 있으면 창을 닫는다.
//   보이지 않는 창이 뒤 화면만 막은 채 남지 않게 한다
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

// 창에서 body까지 올라가며 지나는 요소의 형제를 모두 막는다. 원래 막혀 있던 것은 건드리지 않는다. 돌려주는 함수로 푼다
function blockOutside(el: HTMLElement) {
  const blocked: HTMLElement[] = [];
  for (let n: HTMLElement = el; n !== document.body && n.parentElement; n = n.parentElement) {
    for (const sib of n.parentElement.children) {
      if (sib !== n && sib instanceof HTMLElement && !sib.inert) {
        sib.inert = true;
        blocked.push(sib);
      }
    }
  }
  return () => blocked.forEach((b) => (b.inert = false));
}

// Tab은 창 안에서만, Esc는 어디서든 닫기. 뒤 화면 스크롤도 막는다. 돌려주는 함수로 푼다
function holdKeys(el: HTMLElement, close: () => void) {
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const onKey = (e: KeyboardEvent) => {
    // 이 창 위에 다른 창(검색 창)이 떠 있으면 그 창이 키를 받는다
    const now = document.activeElement;
    if (now && !el.contains(now) && now.closest('[aria-modal="true"]')) return;
    if (e.key === "Escape" && !e.isComposing) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const all = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.tabIndex >= 0 && !x.hasAttribute("disabled") && x.getClientRects().length > 0);
      if (!all.length) return;
      const first = all[0], last = all[all.length - 1];
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
  return () => {
    document.body.style.overflow = prev;
    document.removeEventListener("keydown", onKey, true);
  };
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
    let release: (() => void) | null = blockOutside(el);
    let unhold = keys ? holdKeys(el, () => close.current?.()) : null;
    const free = () => {
      release?.();
      unhold?.();
      release = unhold = null;
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
