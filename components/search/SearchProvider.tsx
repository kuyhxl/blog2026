"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SearchEntry } from "@/lib/content/search";
import SearchDialog from "./SearchDialog";

// 검색 인덱스는 페이지마다 받지 않는다. 검색 창을 처음 열거나 Search 버튼에 마우스를 올릴 때 한 번 받는다
let indexPromise: Promise<SearchEntry[]> | null = null;
export function loadIndex() {
  indexPromise ??= fetch("/search-index.json")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<SearchEntry[]>;
    })
    .catch((e) => {
      indexPromise = null; // 다음에 열 때 다시 시도한다
      throw e;
    });
  return indexPromise;
}

type Ctx = { isOpen: boolean; open: (from?: HTMLElement | null) => void };
const SearchContext = createContext<Ctx>({ isOpen: false, open: () => {} });
export const useSearch = () => useContext(SearchContext);

// 모든 화면 위에 겹쳐 뜨는 검색 창. Search 버튼이나 ⌘K / Ctrl+K로 연다(글자를 입력하는 자리에서도 받는다)
export default function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((from?: HTMLElement | null) => {
    opener.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpen(true);
  }, []);
  // 닫으면 연 자리(Search 버튼)로 포커스를 돌려준다
  const close = useCallback(() => {
    setOpen(false);
    const el = opener.current;
    setTimeout(() => el?.focus({ preventScroll: true }), 0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K" || e.code === "KeyK")) {
        e.preventDefault();
        // 열려 있는 동안의 ⌘K는 검색 창이 받아서 닫는다.
        // 닫으면 Search 버튼으로 포커스를 돌려준다. 다른 창(그래프 크게 보기) 안에서 열었으면 그 창 안의 원래 자리로 돌려준다(Search 버튼은 그 창 뒤에 막혀 있다)
        const here = document.activeElement instanceof HTMLElement && document.activeElement.closest('[aria-modal="true"]') ? document.activeElement : null;
        if (!isOpen) open(here ?? document.querySelector<HTMLElement>("[data-search-button]:not([hidden])") ?? null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, open]);

  return (
    <SearchContext.Provider value={{ isOpen, open }}>
      {children}
      {isOpen && <SearchDialog onClose={close} />}
    </SearchContext.Provider>
  );
}
