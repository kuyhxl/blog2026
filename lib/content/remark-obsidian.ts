// Obsidian 문법을 마크다운 트리로 바꾼다: 위키링크, 이미지 끼워 넣기, ==강조==, 콜아웃, # 제목
// 비공개 노트를 가리키는 링크는 동기화 때 이미 글자로 바뀌어 있다
import type { Blockquote, Image, Link, Paragraph, PhrasingContent, Root, Text } from "mdast";
import { slug as headingId } from "github-slugger";
import { toString } from "mdast-util-to-string";
import { SKIP, visit } from "unist-util-visit";
import { IMAGE_EXT, WIKILINK, baseName, parseWikilink } from "./obsidian.ts";

export type Resolver = {
  // 글 주소. 빈 노드(글 페이지가 없는 공개 CS 노트)는 "empty", content/에 없는 노트는 null
  note: (target: string, heading: string | null) => string | "empty" | null;
  image: (name: string) => { src: string; width?: number; height?: number } | null;
};

const text = (value: string): Text => ({ type: "text", value });

// ==강조== 를 <mark>로
function marks(value: string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const m of value.matchAll(/==([^=\n](?:[^\n]*?[^=\n])?)==/g)) {
    if (m.index > last) out.push(text(value.slice(last, m.index)));
    out.push({ type: "emphasis", data: { hName: "mark" }, children: [text(m[1])] });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push(text(value.slice(last)));
  return out;
}

// ![[그림.png|300]], ![[그림.png|설명]], ![[그림.png|설명|300x200]]
function imageNode(name: string, extra: string | null, r: Resolver): PhrasingContent {
  const found = r.image(name);
  if (!found) return text(name);
  let alt = "", width = found.width, height = found.height;
  for (const part of (extra ?? "").split("|").map((s) => s.trim()).filter(Boolean)) {
    const size = /^(\d+)(?:x(\d+))?$/.exec(part);
    if (size) {
      const w = Number(size[1]);
      height = size[2] ? Number(size[2]) : width && height ? Math.round((height * w) / width) : undefined;
      width = w;
    } else alt = part;
  }
  const img: Image = { type: "image", url: found.src, alt, data: { hProperties: { width, height } } };
  return img;
}

function wikilinks(value: string, r: Resolver, where: (index: number) => string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const m of value.matchAll(WIKILINK)) {
    if (m.index > last) out.push(...marks(value.slice(last, m.index)));
    last = m.index + m[0].length;
    const { target, heading, alias } = parseWikilink(m[2]);
    const name = baseName(target).replace(/\.md$/i, "");
    if (m[1] === "!" && IMAGE_EXT.test(target)) {
      out.push(imageNode(baseName(target), alias, r));
      continue;
    }
    const shown = alias ?? (heading ? (name ? `${name} > ${heading}` : heading) : name);
    const href = target ? r.note(target, heading) : heading ? "#" + headingId(heading) : "empty";
    if (href && href !== "empty") out.push({ type: "link", url: href, children: [text(shown)] } satisfies Link);
    else if (href === "empty") out.push(text(shown));
    else if (alias && m[1] !== "!") out.push(text(alias));
    // 동기화를 거쳤다면 생길 수 없는 경우다. 공개 노트가 아닐 수 있는 이름을 화면에 내보내지 않도록 빌드를 멈춘다
    else throw new Error(`${where(m.index)}: content/에 없는 노트를 가리키는 위키링크가 있습니다. npm run sync를 다시 실행해 주세요`);
  }
  if (last < value.length) out.push(...marks(value.slice(last)));
  return out;
}

// > [!note] 제목  /  > [!tip]- 접힌 콜아웃  /  > [!tip]+ 펼친 채 접을 수 있는 콜아웃
function callout(node: Blockquote) {
  const p = node.children[0];
  if (p?.type !== "paragraph" || p.children[0]?.type !== "text") return;
  const first = p.children[0];
  const m = /^\[!([\w-]+)\]([+-]?)[ \t]*/.exec(first.value);
  if (!m) return;
  const [, type, fold] = m;
  first.value = first.value.slice(m[0].length);

  // 제목: 첫 줄의 나머지. 꾸밈은 빼고 글자만 쓴다
  const title: PhrasingContent[] = [];
  while (p.children.length) {
    const c = p.children[0] as PhrasingContent;
    if (c.type === "text" && c.value.includes("\n")) {
      const i = c.value.indexOf("\n");
      title.push(text(c.value.slice(0, i)));
      c.value = c.value.slice(i + 1);
      break;
    }
    if (c.type === "break") {
      p.children.shift();
      break;
    }
    title.push(c);
    p.children.shift();
  }
  if (!p.children.length || toString(p).trim() === "") node.children.shift();

  const label = toString({ type: "paragraph", children: title } as Paragraph).trim() || type[0].toUpperCase() + type.slice(1).toLowerCase();
  const head: Paragraph = {
    type: "paragraph",
    data: { hName: fold ? "summary" : "span", hProperties: { className: ["callout-label", "mono"] } },
    children: [text(`[ ${label} ]`)],
  };
  node.children.unshift(head);
  node.data = {
    hName: fold ? "details" : "aside",
    hProperties: { className: ["callout"], dataCallout: type.toLowerCase(), role: fold ? undefined : "note", open: fold === "+" ? true : undefined },
  };
}

export default function remarkObsidian(options: { resolve: Resolver; file: string }) {
  const r = options.resolve;
  return (tree: Root) => {
    // 본문 맨 앞의 # 제목은 노트 제목을 되풀이한 것이라 뺀다(페이지 제목은 frontmatter의 title)
    if (tree.children[0]?.type === "heading" && tree.children[0].depth === 1) tree.children.shift();
    // 그 밖의 # 제목은 페이지 제목과 겹치므로 ## 로 다룬다
    visit(tree, "heading", (h) => {
      if (h.depth === 1) h.depth = 2;
    });
    visit(tree, "blockquote", callout);
    // 코드 블록의 언어 뒤에 붙은 말(title=… 등)을 HTML까지 넘긴다
    visit(tree, "code", (c) => {
      if (c.meta) c.data = { ...c.data, hProperties: { dataMeta: c.meta } };
    });
    // 동기화가 파일 이름만 남겨 둔 마크다운 이미지 ![설명](그림.png)
    visit(tree, "image", (img) => {
      if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(img.url)) return;
      let name = img.url;
      try {
        name = decodeURIComponent(img.url);
      } catch {
        // 잘못된 % 표기는 그대로 둔다
      }
      const found = r.image(baseName(name));
      if (found) {
        img.url = found.src;
        img.data = { hProperties: { width: found.width, height: found.height } };
      }
    });
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index == null || parent.type === "link") return;
      if (!node.value.includes("[[") && !node.value.includes("==")) return;
      const line = node.position?.start.line ?? 0;
      const where = (i: number) => `${options.file} 본문 ${line + node.value.slice(0, i).split("\n").length - 1}번째 줄`;
      const parts = wikilinks(node.value, r, where);
      parent.children.splice(index, 1, ...(parts as typeof parent.children));
      return [SKIP, index + parts.length];
    });
  };
}
