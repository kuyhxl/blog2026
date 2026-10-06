"use client";

import { useEffect, useId, useState } from "react";
import type { TocItem } from "@/lib/content/rehype-post";
import styles from "./Toc.module.css";

// 화면 위에서 240px 안으로 들어온 마지막 제목이 현재 항목이다(PostV2의 onScroll)
function useActive(items: TocItem[]) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const onScroll = () => {
      let cur = items[0]?.id ?? "";
      for (const t of items) {
        const el = document.getElementById(t.id);
        if (el && el.getBoundingClientRect().top < 240) cur = t.id;
      }
      setActive(cur);
    };
    const raf = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [items]);
  return active;
}

function Items({ items, active, fold }: { items: TocItem[]; active: string; fold?: boolean }) {
  return items.map((t) => {
    const on = t.id === active;
    return (
      <a key={t.id} href={`#${t.id}`} className={[styles.item, fold && styles.foldItem, on && styles.on].filter(Boolean).join(" ")} aria-current={on ? "location" : undefined}>
        {/* 현재 항목은 번호 대신 네모 */}
        <span className={styles.mark}>{on ? <span className={styles.dot} aria-hidden="true" /> : <span className={styles.num}>{t.num}</span>}</span>
        <span className={t.depth === 3 ? styles.sub : undefined}>{t.text}</span>
      </a>
    );
  });
}

// 데스크톱: 본문 오른쪽에 붙어 따라오는 목차
export function SideToc({ items }: { items: TocItem[] }) {
  const active = useActive(items);
  if (!items.length) return null;
  return (
    <>
      <div className={styles.head}>
        <span className="mono">/Contents</span>
      </div>
      <nav className={styles.list} aria-label="목차">
        <Items items={items} active={active} />
      </nav>
    </>
  );
}

// 좁은 화면: 본문 위에 접혀 있다가 누르면 펼쳐진다(PostV2M). 방금 누른 때만 움직인다
export function FoldToc({ items, className }: { items: TocItem[]; className?: string }) {
  const active = useActive(items);
  const [open, setOpen] = useState(false);
  const [anim, setAnim] = useState(false);
  const bodyId = useId();
  if (!items.length) return null;
  const cls = [styles.fold, open && styles.open, anim && styles.anim, className].filter(Boolean).join(" ");
  return (
    <nav className={cls} aria-label="목차">
      <button
        className={styles.toggle}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={open ? "목차 접기" : "목차 펼치기"}
        onClick={() => {
          setOpen(!open);
          setAnim(true);
        }}
      >
        <span className="mono">/Contents</span>
        <span className={`mono ${styles.count}`}>({items.filter((t) => t.depth === 2).length})</span>
        <span className={styles.icon} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M2 7h10" />
            <path className={styles.v} d="M7 2v10" />
          </svg>
        </span>
      </button>
      <div className={styles.xp} id={bodyId}>
        <div className={styles.xpIn}>
          <div className={styles.xpC}>
            <Items items={items} active={active} fold />
          </div>
        </div>
      </div>
    </nav>
  );
}
