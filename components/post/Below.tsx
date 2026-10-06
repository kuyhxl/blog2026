import Link from "next/link";
import { formatDate, postHref } from "@/lib/content/format";
import type { Backlink } from "@/lib/content/graph";
import type { Note } from "@/lib/content/posts";
import s from "./Below.module.css";

const Arrow = () => (
  <svg className={s.arr} width="16" height="11" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    <path d="M1 6h15M11 1l5 5-5 5" />
  </svg>
);

// 백링크: 이 글을 언급한 글. 언급한 문장 둘레를 잘라 보여 주고, 링크 글자에 밑줄을 긋는다(PostV2의 /Backlinks)
export function Backlinks({ items }: { items: Backlink[] }) {
  return (
    <section className={s.backlinks} aria-label="백링크">
      <div className={s.head}>
        <span className="mono">/Backlinks</span>
        <span className={`mono ${s.dim}`}>({items.length})</span>
      </div>
      <p className={s.lead}>{items.length ? "이 글을 언급한 글" : "아직 이 글을 언급한 글이 없습니다"}</p>
      {items.map((b) => (
        <Link key={b.slug} className={s.row} href={postHref(b.slug)}>
          <span className={s.sq} aria-hidden="true" />
          <time className={s.date} dateTime={b.date}>
            {formatDate(b.date)}
          </time>
          <span className={s.body}>
            <span className={s.title}>
              {b.title}
              {"⁠"}
              <Arrow />
            </span>
            <span className={s.snip}>
              {b.before}
              <span className={s.mark}>{b.text}</span>
              {b.after}
            </span>
          </span>
        </Link>
      ))}
    </section>
  );
}

// 이전 글(더 오래된 글)과 다음 글(더 새 글)
export function PrevNext({ prev, next }: { prev: Note | null; next: Note | null }) {
  if (!prev && !next) return null;
  return (
    <nav className={s.pn} aria-label="이전 글과 다음 글">
      {prev ? (
        <Link className={s.prev} href={postHref(prev.slug)}>
          <span className={`mono ${s.dim}`}>← Prev · {formatDate(prev.date)}</span>
          <span className={s.pnTitle}>{prev.title}</span>
        </Link>
      ) : (
        <span className={s.prev} />
      )}
      {next ? (
        <Link className={s.next} href={postHref(next.slug)}>
          <span className={`mono ${s.dim}`}>Next · {formatDate(next.date)} →</span>
          <span className={s.pnTitle}>{next.title}</span>
        </Link>
      ) : (
        <span className={s.next} />
      )}
    </nav>
  );
}
