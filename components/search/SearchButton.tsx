"use client";

import { loadIndex, useSearch } from "./SearchProvider";
import styles from "@/components/SiteHeader.module.css";

// 헤더의 Search 버튼. 마우스를 올리면 검색 인덱스를 미리 받아 둔다
export default function SearchButton() {
  const { isOpen, open } = useSearch();
  const prefetch = () => {
    loadIndex().catch(() => {});
  };
  return (
    <button
      className={`ghost ${styles.search}`}
      type="button"
      data-search-button=""
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-keyshortcuts="Meta+K Control+K"
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onClick={(e) => open(e.currentTarget)}
    >
      <svg className={styles.searchIcon} viewBox="0 0 14 14" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="6" cy="6" r="4.25" />
        <path d="M9.2 9.2 13 13" />
      </svg>
      <span className={`mono ${styles.searchLabel}`}>Search</span>
      <span className={`mono ${styles.kbd}`} aria-hidden="true">
        ⌘K
      </span>
    </button>
  );
}
