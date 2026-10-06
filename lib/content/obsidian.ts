// Obsidian 문법 가운데 동기화와 빌드가 함께 쓰는 것: 위키링크 읽기, 코드 영역 찾기
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

// [[대상#제목|표시 이름]] 또는 ![[...]]. 표 안에서는 |를 \|로 쓴다
export const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;

export type Wikilink = { target: string; heading: string | null; alias: string | null };

export function parseWikilink(inner: string): Wikilink {
  const pipe = /\\?\|/.exec(inner);
  const ref = pipe ? inner.slice(0, pipe.index) : inner;
  const alias = pipe ? inner.slice(pipe.index + pipe[0].length).trim() : null;
  const hash = ref.indexOf("#");
  const target = (hash < 0 ? ref : ref.slice(0, hash)).trim();
  const heading = hash < 0 ? null : ref.slice(hash + 1).trim() || null;
  return { target, heading, alias: alias || null };
}

// 폴더를 뺀 파일 이름. Obsidian은 노트를 이름만으로도 찾는다
export const baseName = (p: string) => p.split("/").pop() ?? p;

// 한글을 한 가지 모양으로 맞춘다. 같은 "컴퓨터"라도 macOS의 파일 이름은 자모를 나눈 모양(NFD)일 수 있고, 링크에 친 글자는 보통 합친 모양(NFC)이다.
// 노트·첨부 파일의 이름과 경로를 견줄 때는 양쪽 모두 이것을 거친다
export const nfc = (s: string) => s.normalize("NFC");

// 노트를 찾을 때의 열쇠: 폴더와 .md를 떼고, 한글 모양을 맞추고, 대소문자는 가리지 않는다(Obsidian과 같다)
export const noteKey = (target: string) => nfc(baseName(target).replace(/\.md$/i, "")).toLowerCase();

// 코드 블록, 인라인 코드, 수식처럼 Obsidian 문법을 해석하지 않는 구간 [시작, 끝)
export function literalRanges(md: string): [number, number][] {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(md);
  const ranges: [number, number][] = [];
  visit(tree, (node) => {
    if (node.type === "code" || node.type === "inlineCode" || node.type === "math" || node.type === "inlineMath") {
      const s = node.position?.start.offset, e = node.position?.end.offset;
      if (s != null && e != null) ranges.push([s, e]);
    }
  });
  return ranges;
}

export const inRanges = (i: number, ranges: [number, number][]) => ranges.some(([s, e]) => i >= s && i < e);
