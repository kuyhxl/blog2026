"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatDate, postHref } from "@/lib/content/format";
import s from "./PostRow.module.css";

// kind: 글 종류의 이름(CS, 트러블슈팅, TIL). 행 오른쪽 끝(모바일은 날짜 줄 끝)에 작은 라벨로 보인다
export type RowPost = { slug: string; title: string; date: string; summary: string; chips: string[]; kind?: string };

type Props = {
  post: RowPost;
  // 글 목록은 펼침 상태를 직접 들고 있다(브레인 맵이 마지막으로 펼친 행을 보여 주므로). 홈은 행이 스스로 들고 있다
  open?: boolean;
  onToggle?: () => void;
  onEnter?: () => void;
  onLeave?: () => void;
};

// 글 행: 날짜와 큰 제목. +를 누르면 요약, 태그, Read가 펼쳐진다. 방금 누른 행만 움직인다
export default function PostRow({ post, open: given, onToggle, onEnter, onLeave }: Props) {
  const [own, setOwn] = useState(false);
  const open = given ?? own;
  const [anim, setAnim] = useState(false);
  const panel = useId();
  const href = postHref(post.slug);

  return (
    <article
      className={[s.row, open && s.open, anim && s.anim].filter(Boolean).join(" ")}
      onPointerEnter={(e) => e.pointerType === "mouse" && onEnter?.()}
      onPointerLeave={(e) => e.pointerType === "mouse" && onLeave?.()}
    >
      <div className={s.head}>
        <Link className={s.link} href={href}>
          <span className={s.meta}>
            <span className={s.sq} aria-hidden="true" />
            <time className={s.date} dateTime={post.date}>
              {formatDate(post.date)}
            </time>
          </span>
          <span className={s.title}>
            {post.title}
            {/* 화살표가 제목 마지막 낱말과 떨어져 다음 줄로 가지 않게 한다 */}
            {"⁠"}
            <svg className={s.arr} width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
              <path d="M1 6h15M11 1l5 5-5 5" />
            </svg>
          </span>
          {post.kind && <span className={`mono ${s.kind}`}>{post.kind}</span>}
        </Link>
        <button
          className={s.pm}
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          aria-label={`${open ? "접기" : "펼치기"}: ${post.title}`}
          onClick={() => {
            if (onToggle) onToggle();
            else setOwn(!own);
            setAnim(true);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
            <path d="M2 7h10" />
            <path className={s.v} d="M7 2v10" />
          </svg>
        </button>
      </div>
      <div className={s.xp} id={panel}>
        <div className={s.xpIn}>
          <div className={s.xpC}>
            {post.summary && (
              <>
                <span className={`mono ${s.label}`}>Summary</span>
                <p className={s.summary}>{post.summary}</p>
              </>
            )}
            <span className={`mono ${s.label} ${s.tagsLabel}`}>Tags</span>
            <div className={s.tags}>
              {post.chips.map((t) => (
                <span key={t} className={s.tag}>
                  {t}
                </span>
              ))}
            </div>
            <span className={s.spacer} />
            <Link className={`mono solid ${s.read}`} href={href}>
              <span>Read</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
