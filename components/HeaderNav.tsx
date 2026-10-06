"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import styles from "./SiteHeader.module.css";

// 주 메뉴. key는 단축키, base는 이 메뉴가 현재 화면으로 표시되는 주소의 시작
const MENU = [
  { key: "b", href: "/blog/", base: "/blog", label: "Blog" },
  { key: "c", href: "/cs/", base: "/cs", label: "Beauty of CS" },
] as const;
type MenuKey = (typeof MENU)[number]["key"];

// 글자를 입력하는 자리에서는 단축키를 받지 않는다
function typing(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  return t instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|reset)$/.test(t.type);
}

// 헤더 왼쪽: 홈 링크와 주 메뉴. 현재 화면의 메뉴는 이름에 밑줄
export default function HeaderNav() {
  const router = useRouter();
  const path = usePathname().replace(/\/+$/, "") || "/";
  // 단축키를 누른 순간 반전되는 메뉴
  const [hit, setHit] = useState<MenuKey | null>(null);
  const navTimer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat || typing(e.target)) return;
      // 한글 입력 상태에서도 같은 자리의 키로 동작하게 한다
      const ch = e.key && e.key.length === 1 ? e.key.toLowerCase() : "";
      const k = /^[a-z]$/.test(ch) ? ch : e.code === "KeyB" ? "b" : e.code === "KeyC" ? "c" : "";
      const item = MENU.find((m) => m.key === k);
      if (!item) return;
      e.preventDefault();
      if (navTimer.current !== null) return;
      // 메뉴를 한 번 반전시킨 뒤 그 링크를 누른 것과 똑같이 이동한다
      setHit(item.key);
      navTimer.current = window.setTimeout(() => {
        navTimer.current = null;
        setHit(null);
        router.push(item.href);
      }, 140);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (navTimer.current !== null) window.clearTimeout(navTimer.current);
      navTimer.current = null;
    };
  }, [router]);

  return (
    <div className={styles.left}>
      <Link className={styles.home} href="/" aria-current={path === "/" ? "page" : undefined}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.name}>{site.name}</span>
      </Link>
      <nav className={styles.nav} aria-label="주 메뉴">
        {MENU.map((m) => {
          const cur = path === m.base || path.startsWith(m.base + "/");
          const cls = ["mono", styles.nk, cur && styles.cur, hit === m.key && styles.hit].filter(Boolean).join(" ");
          return (
            <Link key={m.key} className={cls} href={m.href} aria-current={cur ? "page" : undefined} aria-keyshortcuts={m.key.toUpperCase()}>
              <span className={styles.k} aria-hidden="true">[{m.key.toUpperCase()}]</span>
              <span className={styles.l}>{m.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
