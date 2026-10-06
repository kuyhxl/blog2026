"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/theme";

const root = () => document.documentElement;
const isDark = () => root().classList.contains("dark");

// <html>의 class가 바뀌면 버튼 상태(aria-pressed)도 따라 바뀐다
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(root(), { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

function chosen() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

// 테마 전환 버튼. 고른 값은 기억하고, 고른 적이 없으면 운영체제 설정을 따라간다
export default function ThemeToggle({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const c = chosen();
      root().classList.toggle("dark", c === "dark" || (c !== "light" && mq.matches));
    };
    // 개발 모드에서는 Strict Mode가 다시 마운트하면서 <html>의 class를 지우므로 다시 붙인다. 배포 빌드에서는 바뀌는 것이 없다
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const toggle = () => {
    const next = !isDark();
    root().classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // 저장할 수 없으면 이번 방문에만 적용된다
    }
  };

  return (
    <button className={className} type="button" aria-label="테마 전환" aria-pressed={dark} onClick={toggle}>
      {/* 반쯤 찬 원. 다크에서는 좌우가 뒤집힌다 */}
      <svg className={iconClassName} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
      </svg>
    </button>
  );
}
