// 코드 블록 구문 나누기. 시안(PostV2의 .kw, .cm)처럼 색을 쓰지 않는다: 키워드는 굵게, 주석은 --ink-3
import type { Element } from "hast";
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter, type ShikiTransformer, type ThemeRegistration } from "shiki";

// 키워드와 주석만 가려내기 위한 테마. 실제 색은 쓰지 않고 아래 변환에서 클래스로 바꾼다
const COMMENT = "#808080";
const THEME: ThemeRegistration = {
  name: "ink",
  type: "light",
  colors: { "editor.foreground": "#000000", "editor.background": "#ffffff" },
  settings: [
    { settings: { foreground: "#000000", background: "#ffffff" } },
    { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: COMMENT } },
    { scope: ["keyword", "storage", "punctuation.definition.directive"], settings: { fontStyle: "bold" } },
    // 연산자, 숫자 접미사(1UL의 UL), 기본 타입(int, void, uint64_t)은 키워드로 치지 않는다. 시안에서도 굵지 않다
    { scope: ["keyword.operator", "keyword.other.unit", "storage.type.built-in", "storage.type.primitive", "storage.type.numeric"], settings: { fontStyle: "" } },
    // 말로 된 연산자(new, typeof, instanceof, and, not)는 굵게
    { scope: ["keyword.operator.new", "keyword.operator.expression", "keyword.operator.logical.python", "keyword.operator.word"], settings: { fontStyle: "bold" } },
  ],
};

let highlighter: Promise<Highlighter> | null = null;

function transformer(lines: number): ShikiTransformer {
  const pad = Math.max(2, String(lines).length);
  return {
    pre(node) {
      node.properties = { className: ["code-pre"], tabIndex: 0 };
    },
    code(node) {
      node.properties = {};
    },
    line(node, n) {
      node.properties = { className: ["cl"] };
      node.children.unshift({ type: "element", tagName: "span", properties: { className: ["ln"], ariaHidden: "true" }, children: [{ type: "text", value: String(n).padStart(pad, "0") }] });
    },
    span(node) {
      const style = String(node.properties.style ?? "").toLowerCase();
      const cls = [];
      if (style.includes("font-weight:bold")) cls.push("kw");
      if (style.includes(COMMENT)) cls.push("cm");
      node.properties = cls.length ? { className: cls } : {};
    },
  };
}

export async function highlight(code: string, lang: string): Promise<Element> {
  highlighter ??= createHighlighter({ themes: [THEME], langs: [] });
  const h = await highlighter;
  const known = lang.toLowerCase() in bundledLanguages ? (lang.toLowerCase() as BundledLanguage) : null;
  if (known && !h.getLoadedLanguages().includes(known)) await h.loadLanguage(known);
  const root = h.codeToHast(code, { lang: known ?? "text", theme: "ink", transformers: [transformer(code.split("\n").length)] });
  return root.children[0] as Element;
}
