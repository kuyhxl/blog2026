"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { TYPE_LABEL, formatDate, postHref } from "@/lib/content/format";
import type { SearchEntry } from "@/lib/content/search";
import { pieces, prepare, search, tagHit, type Hit, type Piece } from "@/lib/search-match";
import { loadIndex } from "./SearchProvider";
import { useModal } from "../useModal";
import s from "./Search.module.css";

// 검색 창. 원본은 SearchV2. 640px 이하에서는 화면을 가득 채운다
const NARROW = "(max-width: 640px)";
const RECENT = 5; // 입력하기 전에 보여 주는 최근 글 수
const TOPICS = 12; // 결과가 없을 때 고르게 해 주는 태그 수

const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

const Marked = ({ parts }: { parts: Piece[] }) => (
  <>{parts.map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}</>
);

export default function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  // q: 검색어. at: 고른 행. kbd: 화살표 키로 행을 옮긴 적이 있는지
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [kbd, setKbd] = useState(false);
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const win = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const onVeil = useRef(false);
  const ptr = useRef("");
  const reveal = useRef(false);
  // 열려 있는 동안 뒤 화면을 막고 스크롤을 잠근다(Tab, Esc는 아래에서 이 창이 직접 다룬다)
  useModal(win);

  useEffect(() => {
    let alive = true;
    loadIndex().then(
      (data) => {
        if (!alive) return;
        setIndex(data);
        // 첫 글자를 칠 때 멈칫하지 않도록 찾을 준비를 미리 해 둔다
        prepare(data);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  // 열리면 입력칸이 포커스를 갖는다
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  // 검색어나 인덱스가 바뀔 때만 다시 찾는다. 행에 마우스를 올리거나 화살표 키로 옮길 때는 찾지 않는다
  const found = useMemo(() => (index ? search(index, q) : null), [index, q]);
  const terms = found?.terms ?? [];
  const recent = useMemo(() => (index ? [...index].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT) : []), [index]);
  const list: Hit[] = found ? found.hits : recent.map((entry) => ({ entry, snip: "" }));
  const cur = Math.min(at, Math.max(0, list.length - 1));
  const none = !!found && !list.length;
  const optId = (i: number) => `${uid}-o-${i}`;

  // 키보드로 옮긴 행이 목록 밖에 있으면 목록만 스크롤한다(화면 전체는 움직이지 않는다)
  useEffect(() => {
    if (!reveal.current || !box.current) return;
    reveal.current = false;
    const el = box.current.querySelector('[role="option"][aria-selected="true"]');
    if (!el) return;
    const b = box.current.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < b.top) box.current.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) box.current.scrollTop += r.bottom - b.bottom;
  }, [at]);

  const setQuery = (v: string) => {
    setQ(v);
    setAt(0);
    if (box.current) box.current.scrollTop = 0;
  };
  const clear = () => {
    setQuery("");
    input.current?.focus({ preventScroll: true });
  };
  const open = (i: number) => {
    const h = list[i];
    if (!h) return;
    onClose();
    router.push(postHref(h.entry.slug));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    // 한글을 조합하는 중에 누른 키는 입력기가 쓴다
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (k === "k" || k === "K" || e.code === "KeyK")) {
      e.preventDefault();
      onClose();
    } else if (k === "Escape") {
      if (!composing) {
        e.preventDefault();
        onClose();
      }
    } else if (k === "ArrowDown" || k === "ArrowUp") {
      if (!composing && list.length) {
        e.preventDefault();
        reveal.current = true;
        setAt((cur + (k === "ArrowDown" ? 1 : -1) + list.length) % list.length);
        setKbd(true);
      }
    } else if (k === "Enter") {
      // 입력칸에서 누른 Enter만 고른 글을 연다. 화면을 가득 채운 모양에서는 화살표 키로 고른 적이 없으면 자판만 내린다
      if (!composing && e.target === input.current) {
        e.preventDefault();
        if (narrow && !kbd) input.current?.blur();
        else open(cur);
      }
    } else if (k === "Tab") {
      // Tab은 창 안에서만 돈다
      const all = [...(win.current?.querySelectorAll<HTMLElement>("input, button, a[href]") ?? [])].filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
      if (all.length) {
        const first = all[0], last = all[all.length - 1], now = document.activeElement;
        if (e.shiftKey && (now === first || !win.current?.contains(now))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && now === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    // 뒤 화면의 단축키(B, C)가 같이 눌리지 않게 한다
    e.stopPropagation();
  };

  // 결과가 없을 때 고르게 해 주는 태그: 많이 쓴 순서
  const topics = (() => {
    if (!none || !index) return [];
    const count = new Map<string, number>();
    const kinds = new Set(Object.values(TYPE_LABEL));
    for (const e of index) for (const t of e.tags) if (!kinds.has(t)) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, TOPICS).map(([t]) => t);
  })();

  const label = found ? "/Results" : "/Recent";
  const count = !index ? "" : found ? `${list.length} / ${index.length}` : `(${list.length})`;

  return (
    <div
      className={s.veil}
      onPointerDown={(e) => {
        // 바깥(가림막)을 누르면 닫힌다. 창 안에서 누르기 시작해 바깥에서 뗀 것은 치지 않는다
        onVeil.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (onVeil.current && e.target === e.currentTarget) onClose();
        onVeil.current = false;
      }}
    >
      <div
        ref={win}
        className={s.win}
        role="dialog"
        aria-modal="true"
        aria-label="검색"
        onKeyDown={onKey}
        onPointerDown={(e) => (ptr.current = e.pointerType)}
        onMouseDown={(e) => {
          // 창 안의 빈 곳을 마우스로 눌러도 입력칸이 포커스를 잃지 않게 한다
          if (ptr.current !== "mouse" || (e.target as Element).closest("input, button, a, label")) return;
          e.preventDefault();
          input.current?.focus({ preventScroll: true });
        }}
      >
        <div className={s.top}>
          <span className="mono">[ Search ]</span>
          <span className={s.stripes} aria-hidden="true" />
          <button className={s.iconBtn} type="button" aria-label="검색 닫기" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>

        <div className={s.field}>
          <label htmlFor={`${uid}-q`} className={s.lens}>
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="6" cy="6" r="4.25" />
              <path d="M9.2 9.2 13 13" />
            </svg>
            <span className="sr-only">검색어</span>
          </label>
          <input
            ref={input}
            id={`${uid}-q`}
            className={s.input}
            type="text"
            role="combobox"
            aria-expanded={list.length > 0}
            aria-controls={`${uid}-list`}
            aria-activedescendant={list.length ? optId(cur) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="제목, 요약, 태그, 본문에서 찾기"
            value={q}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && (
            <button className={`mono ${s.clearText}`} type="button" onClick={clear}>
              Clear
            </button>
          )}
          {q && (
            <button className={s.clearIcon} type="button" aria-label="검색어 지우기" onClick={clear}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
                <rect x="2.5" y="2.5" width="13" height="13" />
                <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" />
              </svg>
            </button>
          )}
          <span className={`mono ${s.esc}`} aria-hidden="true">
            Esc
          </span>
          <button className={`mono ${s.closeText}`} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div ref={box} className={s.scroll}>
          <div className={s.listHead}>
            <span className={`mono ${s.dim}`}>{label}</span>
            <span className={`mono ${s.dim}`} aria-live="polite">
              {count}
            </span>
          </div>

          {list.length > 0 && (
            <ul id={`${uid}-list`} className={s.list} role="listbox" aria-label={found ? "검색 결과" : "최근 글"}>
              {list.map((h, i) => {
                const on = i === cur;
                return (
                  <li
                    key={h.entry.slug}
                    id={optId(i)}
                    role="option"
                    aria-selected={on}
                    // 화면을 가득 채운 모양에서는 화살표 키를 쓴 뒤에만 고른 행을 표시한다
                    className={`${s.row} ${on && (!narrow || kbd) ? s.on : ""}`}
                    onMouseMove={() => at !== i && setAt(i)}
                  >
                    <Link href={postHref(h.entry.slug)} tabIndex={-1} className={s.rowLink} onClick={onClose}>
                      <span className={s.sq} aria-hidden="true" />
                      <time className={s.date} dateTime={h.entry.date}>
                        {formatDate(h.entry.date)}
                      </time>
                      <span className={s.body}>
                        <span className={s.title}>
                          <Marked parts={pieces(h.entry.title, terms)} />
                        </span>
                        {h.snip && (
                          <span className={s.snip}>
                            <Marked parts={pieces(h.snip, terms)} />
                          </span>
                        )}
                        <span className={s.tags}>
                          {h.entry.tags.map((t) => (
                            <span key={t} className={`${s.tag} ${tagHit(t, terms) ? s.tagHit : ""}`}>
                              {t}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className={s.ret} aria-hidden="true">
                        ↵
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {!index && <p className={s.note}>{failed ? "검색 목록을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요." : "불러오는 중…"}</p>}
          {index && !found && !list.length && <p className={s.note}>아직 공개된 글이 없습니다.</p>}

          {none && (
            <div className={s.none}>
              <p className={s.noneTitle}>‘{q}’에 맞는 글이 없습니다.</p>
              <p className={s.noneText}>제목, 요약, 태그, 본문에서 찾습니다. 낱말을 줄이거나 다른 말로 바꿔 보세요.</p>
              <div className={s.noneActions}>
                <button className={`mono ${s.solidBtn}`} type="button" onClick={clear}>
                  Clear
                </button>
                <Link className={`mono ${s.solidBtn}`} href="/blog" onClick={onClose}>
                  <span>All posts</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              {topics.length > 0 && (
                <>
                  <div className={s.topicsHead}>
                    <span className={`mono ${s.dim}`}>/Topics</span>
                  </div>
                  <div className={s.topics}>
                    {topics.map((t) => (
                      <button key={t} className={s.topic} type="button" onClick={() => setQuery(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className={s.foot} aria-hidden="true">
          <span className={s.keys}>
            <span className={s.key}>↑</span>
            <span className={s.key}>↓</span>
            <span className="mono">Move</span>
          </span>
          <span className={s.keys}>
            <span className={s.key}>↵</span>
            <span className="mono">Open</span>
          </span>
          <span className={s.keys}>
            <span className={`mono ${s.key}`}>Esc</span>
            <span className="mono">Close</span>
          </span>
          <span className={s.grow} />
          <span className={s.footNote}>제목 · 요약 · 태그 · 본문에서 찾습니다</span>
        </div>
      </div>
    </div>
  );
}
