// 본문 HTML을 시안(PostV2) 모양으로 다듬는다
// - ## 제목에 01, 02… 번호, 제목마다 id, 목차 모으기(## 과 ###)
// - 첫 문단은 크게(.lead)
// - 그림과 Mermaid는 [ FIG. 02 ]부터 번호를 매긴 틀로 감싼다(FIG. 01은 글 옆의 연결 글 창이 쓴다)
// - 코드 블록은 이름 줄, Copy 버튼, 줄 번호가 있는 틀로, 표는 옆으로 밀리는 틀로 감싼다
import type { Element, ElementContent, Root } from "hast";
import type { VFile } from "vfile";
import GithubSlugger from "github-slugger";
import { toString } from "hast-util-to-string";
import { SKIP, visit } from "unist-util-visit";
import { highlight } from "./highlight.ts";

export type TocItem = { id: string; text: string; depth: 2 | 3; num: string };

const el = (tagName: string, className: string[] | null, children: ElementContent[], props: Element["properties"] = {}): Element => ({
  type: "element",
  tagName,
  properties: className ? { className, ...props } : props,
  children,
});
const txt = (value: string): ElementContent => ({ type: "text", value });
const classes = (n: Element) => (Array.isArray(n.properties.className) ? n.properties.className.map(String) : []);

function figure(no: number, body: ElementContent[], caption: string, extra: string[] = []): Element {
  const bar = el("div", ["fig-bar"], [
    el("span", ["mono", "fig-no"], [txt(`[ FIG. ${String(no).padStart(2, "0")} ]`)]),
    el("span", ["fig-rule"], [], { ariaHidden: "true" }),
  ]);
  const kids: ElementContent[] = [bar, el("div", ["fig-body"], body)];
  if (caption) kids.push(el("figcaption", null, [txt(caption)]));
  return el("figure", ["fig", ...extra], kids);
}

// 언어 뒤에 붙은 말에서 파일 이름: ```c title=translate.c  또는  title="a b.c"
function titleOf(meta: string) {
  const m = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  return m ? (m[1] ?? m[2] ?? m[3]) : "";
}

export default function rehypePost() {
  return async (tree: Root, file: VFile) => {
    const slugger = new GithubSlugger();
    const toc: TocItem[] = [];
    let h2 = 0;
    let fig = 1;
    const codes: { pre: Element; parent: Element | Root; index: number; lang: string; meta: string }[] = [];

    // 첫 문단
    const first = tree.children.find((c) => c.type === "element");
    if (first?.type === "element" && first.tagName === "p") first.properties.className = [...classes(first), "lead"];

    visit(tree, "element", (node, index, parent) => {
      if (!parent || index == null) return;
      // 각주 묶음 안의 제목은 번호와 목차에서 뺀다
      if (node.tagName === "section" && node.properties.dataFootnotes != null) return SKIP;

      if (/^h[2-6]$/.test(node.tagName)) {
        const text = toString(node).trim();
        const id = slugger.slug(text);
        node.properties.id = id;
        if (node.tagName === "h2") {
          const num = String(++h2).padStart(2, "0");
          node.children = [el("span", ["mono", "h-num"], [txt(num)]), el("span", null, node.children)];
          toc.push({ id, text, depth: 2, num });
        } else if (node.tagName === "h3") toc.push({ id, text, depth: 3, num: "" });
        return SKIP;
      }

      // 그림만 있는 문단 → 그림 틀
      if (node.tagName === "p") {
        const kids = node.children.filter((c) => !(c.type === "text" && !c.value.trim()) && !(c.type === "element" && c.tagName === "br"));
        if (kids.length && kids.every((c) => c.type === "element" && c.tagName === "img")) {
          const figs = (kids as Element[]).map((img) => {
            img.properties = { ...img.properties, loading: "lazy", decoding: "async" };
            return figure(++fig, [img], String(img.properties.alt ?? ""), ["fig-image"]);
          });
          parent.children.splice(index, 1, ...figs);
          return [SKIP, index + figs.length];
        }
      }

      if (node.tagName === "table") {
        parent.children[index] = el("div", ["table-wrap"], [node]);
        return SKIP;
      }

      if (node.tagName === "pre") {
        const code = node.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
        if (!code) return;
        const lang = classes(code).find((c) => c.startsWith("language-"))?.slice(9) ?? "";
        const source = toString(code).replace(/\n$/, "");
        if (lang === "mermaid") {
          // 그리는 일은 브라우저에서 한다(components/post/PostBody.tsx). 그리기 전과 실패했을 때는 원문이 보인다
          parent.children[index] = figure(++fig, [el("pre", ["mermaid-src"], [txt(source)])], "", ["fig-mermaid"]);
          return SKIP;
        }
        codes.push({ pre: node, parent, index, lang, meta: String(code.properties.dataMeta ?? "") });
        return SKIP;
      }
    });

    for (const c of codes) {
      const code = toString(c.pre).replace(/\n$/, "");
      const pre = await highlight(code, c.lang);
      const name = titleOf(c.meta) || c.lang || "text";
      c.parent.children[c.index] = el("figure", ["code"], [
        el("div", ["code-bar"], [
          el("span", ["code-name"], [txt(name)]),
          el("button", ["mono", "ghost", "code-copy"], [txt("Copy")], { type: "button" }),
        ]),
        pre,
      ]);
    }

    file.data.toc = toc;
  };
}

declare module "vfile" {
  interface DataMap {
    toc: TocItem[];
  }
}
