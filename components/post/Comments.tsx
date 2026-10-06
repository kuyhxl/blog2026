"use client";

import { useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import s from "./Below.module.css";

const ORIGIN = "https://giscus.app";
const themeNow = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");

// 댓글(giscus). 원본은 PostV2의 /Comments(모양만 있는 시안). 댓글 목록과 입력칸은 giscus가 그린다.
// - 글과 토론은 slug로 잇는다(mapping=specific, term=blog/<slug>). slug를 바꾸면 기존 댓글과 연결이 끊긴다
// - strict: 토론 제목의 SHA-1 해시로 찾아서, 이름이 비슷한 글끼리 토론이 섞이지 않는다
// - 사이트의 라이트·다크 전환을 따라간다. 스크롤해서 가까워지면 그때 불러온다
// 빈 CS 노드는 글 페이지가 없으므로 댓글 창도 없다
export default function Comments({ slug }: { slug: string }) {
  const g = site.giscus;
  const ready = !!(g.repoId && g.category && g.categoryId);
  const box = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!ready || !el) return;

    const load = () => {
      const script = document.createElement("script");
      script.src = `${ORIGIN}/client.js`;
      script.async = true;
      script.crossOrigin = "anonymous";
      const attrs: Record<string, string> = {
        "data-repo": g.repo,
        "data-repo-id": g.repoId,
        "data-category": g.category,
        "data-category-id": g.categoryId,
        "data-mapping": "specific",
        "data-term": `blog/${slug}`,
        "data-strict": "1",
        "data-reactions-enabled": "0",
        "data-emit-metadata": "1",
        "data-input-position": "bottom",
        "data-theme": themeNow(),
        "data-lang": "ko",
        "data-loading": "lazy",
      };
      for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
      el.replaceChildren(script);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        load();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);

    // 사이트 테마를 바꾸면 giscus에도 알린다
    const mo = new MutationObserver(() => {
      const frame = el.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
      frame?.contentWindow?.postMessage({ giscus: { setConfig: { theme: themeNow() } } }, ORIGIN);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // 댓글 수: giscus가 보내 주는 토론 정보(emit-metadata). 아직 토론이 없으면 0
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== ORIGIN || !e.data?.giscus) return;
      const d = e.data.giscus.discussion;
      if (d) setCount((d.totalCommentCount ?? 0) + (d.totalReplyCount ?? 0));
      else if (e.data.giscus.error) setCount(0);
    };
    window.addEventListener("message", onMessage);

    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("message", onMessage);
    };
  }, [ready, slug, g.repo, g.repoId, g.category, g.categoryId]);

  return (
    <section className={s.comments} aria-label="댓글">
      <div className={s.head}>
        <span className="mono">/Comments</span>
        <span className={`mono ${s.dim}`}>{count != null ? `(${count})` : ""}</span>
      </div>
      {ready ? <div ref={box} className={s.giscus} /> : <p className={s.lead}>댓글은 준비 중입니다.</p>}
    </section>
  );
}
