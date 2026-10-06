// 빌드의 마지막 확인: 본문 HTML의 링크·그림 주소가 바깥 주소이거나, 사이트에 실제로 있는 곳(글, 글 목록, 지도, RSS, 그림)만 가리키는지 본다.
// 동기화를 거치지 않았거나 동기화가 놓친 주소는 비공개 노트의 경로일 수 있으므로, 주소는 알리지 않고 줄만 알리며 빌드를 멈춘다.
// 주소는 브라우저와 같은 방식(URL 표준)으로 풀어서 본다. 그래서 쿼리, % 표기, 문자 참조, 탭, 역슬래시 같은 꾸밈에 속지 않는다
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

const SITE = "https://site.invalid";
// 정화(sanitize.ts)를 거친 뒤에 남을 수 있는 주소 속성
const URL_PROPS = ["href", "src", "cite", "longDesc"];

export type SiteUrlOptions = {
  file: string; // 알릴 때 쓰는 이름(content/posts/….md)
  page: string; // 이 글의 주소. 상대 주소를 풀 때 기준이 된다
  known: (pathname: string) => boolean; // 사이트에 있는 주소인가
};

export default function rehypeSiteUrls(options: SiteUrlOptions) {
  const ok = (value: string, node: Element) => {
    let u: URL;
    try {
      u = new URL(value, SITE + options.page);
    } catch {
      return false;
    }
    if (u.origin !== SITE) return true; // 바깥 주소(정화를 거쳐 http·https·mailto 같은 것만 남는다)
    // 볼트에서 찾지 못한 그림은 파일 이름만 남는다(동기화가 알린다). 폴더가 없으니 경로가 드러나지 않는다
    if (node.tagName === "img" && !/[/\\]/.test(value) && !/^\s*[a-z][a-z0-9+.-]*:/i.test(value)) return true;
    let pathname = u.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    return options.known(pathname);
  };
  return (tree: Root) => {
    const lines: number[] = [];
    visit(tree, "element", (node) => {
      for (const k of URL_PROPS) {
        const v = node.properties[k];
        if (typeof v === "string" && !ok(v, node)) lines.push(node.position?.start.line ?? 0);
      }
    });
    if (lines.length) {
      const at = [...new Set(lines)].filter(Boolean).sort((a, b) => a - b);
      throw new Error(
        `${options.file}${at.length ? ` 본문 ${at.join(", ")}번째 줄` : ""}: 사이트에 없는 곳을 가리키는 링크나 그림 주소가 ${lines.length}개 있습니다. ` +
          "공개 노트가 아닌 곳을 가리킬 수 있어 주소는 적지 않습니다. npm run sync를 다시 실행해 주세요",
      );
    }
  };
}
