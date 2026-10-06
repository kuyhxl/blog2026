// 검색 인덱스. 빌드 때 content/의 공개 노트로 만들어 /search-index.json 하나로 내보낸다.
// 본문이 있는 글만 넣는다(빈 CS 노드는 빠진다). 비공개 노트는 content/에 없으므로 들어갈 수 없다
import type { Nodes, Root } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { IMAGE_EXT, WIKILINK, baseName, parseWikilink } from "./obsidian.ts";
import { chipsOf } from "./format.ts";
import { posts } from "./posts.ts";

export type SearchEntry = {
  slug: string;
  title: string;
  date: string;
  tags: string[]; // 종류 라벨과 태그(글 행의 칩과 같다)
  summary: string;
  text: string; // 본문 글자. 문단마다 줄을 바꾼다
};

// [[노트|별칭]] → 별칭, ==강조== → 강조. 그림 끼워 넣기와 콜아웃 머리 [!note]는 뺀다
function plain(s: string) {
  return s
    .replace(WIKILINK, (_, bang: string, inner: string) => {
      const { target, heading, alias } = parseWikilink(inner);
      if (bang && IMAGE_EXT.test(target)) return "";
      const name = baseName(target).replace(/\.md$/i, "");
      return alias ?? (heading ? (name ? `${name} > ${heading}` : heading) : name);
    })
    .replace(/==([^=\n]+)==/g, "$1")
    .replace(/^\[![\w-]+\][+-]?\s*/, "");
}

// 글자만 모은다. 수식, Mermaid, HTML 태그와 그림은 뺀다
function textOf(node: Nodes): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "inlineMath":
    case "math":
    case "html":
    case "image":
    case "imageReference":
      return "";
    case "break":
      return " ";
    default:
      return "children" in node ? (node.children as Nodes[]).map(textOf).join("") : "";
  }
}

function blocks(tree: Root): string[] {
  const out: string[] = [];
  const walk = (node: Nodes) => {
    if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
      const t = plain(textOf(node)).replace(/\s+/g, " ").trim();
      if (t) out.push(t);
      return;
    }
    if (node.type === "code") {
      if (node.lang !== "mermaid") for (const line of node.value.split("\n")) if (line.trim()) out.push(line.trim());
      return;
    }
    if ("children" in node) for (const c of node.children as Nodes[]) walk(c);
  };
  walk(tree);
  return out;
}

export function searchIndex(): SearchEntry[] {
  return posts().map((p) => {
    const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(p.body) as Root;
    return { slug: p.slug, title: p.title, date: p.date, tags: chipsOf(p), summary: p.summary, text: blocks(tree).join("\n") };
  });
}
