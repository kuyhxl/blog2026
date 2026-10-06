"use client";

import { useEffect, useRef } from "react";

// 본문 HTML(빌드 때 만든 것)에 브라우저에서만 할 수 있는 일을 붙인다: 코드 복사, Mermaid 그리기
export default function PostBody({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Copy: 줄 번호를 뺀 코드만 복사한다
    const onClick = async (e: MouseEvent) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>(".code-copy");
      const code = btn?.closest("figure")?.querySelector("code");
      if (!btn || !code) return;
      const lines = [...code.querySelectorAll(".cl")].map((line) =>
        [...line.childNodes].filter((n) => !(n instanceof Element && n.classList.contains("ln"))).map((n) => n.textContent).join(""),
      );
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Failed";
      }
      window.setTimeout(() => (btn.textContent = "Copy"), 1500);
    };
    root.addEventListener("click", onClick);

    // Mermaid: 이 글에 있을 때만 불러온다. 색은 지금 테마의 토큰을 쓰고, 테마가 바뀌면 다시 그린다
    const figs = [...root.querySelectorAll<HTMLElement>(".fig-mermaid")];
    let alive = true;
    let observer: MutationObserver | null = null;
    if (figs.length) {
      let run = 0;
      const draw = async () => {
        const id = ++run;
        const { default: mermaid } = await import("mermaid");
        const css = getComputedStyle(document.documentElement);
        const v = (name: string) => css.getPropertyValue(name).trim();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          // Mermaid 12의 기본 모양(neo)은 상자에 흐린 그림자를 넣어 다크에서 번져 보인다. 사이트처럼 평평한 classic을 쓴다
          look: "classic",
          fontFamily: v("--sans"),
          themeVariables: {
            fontFamily: v("--sans"),
            fontSize: "14px",
            background: v("--panel"),
            primaryColor: v("--panel"),
            primaryTextColor: v("--ink"),
            primaryBorderColor: v("--ink"),
            secondaryColor: v("--sunken"),
            tertiaryColor: v("--bg"),
            lineColor: v("--ink-2"),
            textColor: v("--ink"),
          },
        });
        for (const [i, fig] of figs.entries()) {
          const body = fig.querySelector(".fig-body");
          const src = (fig.dataset.src ??= fig.querySelector(".mermaid-src")?.textContent ?? "");
          if (!body || !src) continue;
          try {
            const { svg } = await mermaid.render(`mermaid-${i}-${id}`, src);
            if (alive && id === run) body.innerHTML = svg;
          } catch {
            // 그리지 못하면 원문을 그대로 둔다
          }
        }
      };
      draw();
      observer = new MutationObserver(() => draw());
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      alive = false;
      root.removeEventListener("click", onClick);
      observer?.disconnect();
    };
  }, [html]);

  return <article ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
