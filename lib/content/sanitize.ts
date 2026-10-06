// 본문 HTML 정화. 노트에 적힌 HTML(<script>, onerror=, javascript: 주소 등)이 방문자 브라우저에서 돌지 않게 한다.
// rehype-raw로 노트 속 HTML을 트리로 읽은 바로 뒤에 돌고, 그 뒤의 단계(수식, 코드 색, 그림 틀)는 이 사이트가 만든 것이라 정화하지 않는다.
// 기준은 GitHub와 같은 기본 허용 목록이고, 여기에 이 사이트가 마크다운에서 만드는 것만 더한다
import type { Element, Root } from "hast";
import { defaultSchema, type Options } from "rehype-sanitize";
import { visit } from "unist-util-visit";

const attrs = defaultSchema.attributes ?? {};

export const schema: Options = {
  ...defaultSchema,
  // ==강조==(mark)와 콜아웃(aside, details)
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", "aside"],
  // 허용하지 않는 요소는 껍질만 벗기고 안의 글자를 남기는데, 이 둘은 안의 글자도 보여서는 안 된다
  strip: ["script", "style"],
  attributes: {
    ...attrs,
    // 수식(remark-math)과 코드 블록의 언어 뒤에 붙은 말(title=… 등)
    code: [["className", /^language-./, "math-inline", "math-display"], "dataMeta"],
    // 콜아웃: > [!note] 제목 → aside.callout, 접히는 것은 details.callout
    aside: [["className", "callout"], "dataCallout", ["role", "note"]],
    details: [...(attrs.details ?? []), ["className", "callout"], "dataCallout"],
    summary: [...(attrs.summary ?? []), ["className", "callout-label", "mono"]],
    span: [...(attrs.span ?? []), ["className", "callout-label", "mono"]],
  },
};

// 정화는 노트 속 HTML의 id 앞에 "user-content-"를 붙여 화면의 다른 요소와 이름이 겹치지 않게 한다.
// 각주처럼 같은 글 안을 가리키는 #주소가 그 id를 따라가도록 고친다
export function rehypeHashLinks() {
  return (tree: Root) => {
    const ids = new Set<string>();
    visit(tree, "element", (node: Element) => {
      if (typeof node.properties.id === "string") ids.add(node.properties.id);
    });
    visit(tree, "element", (node: Element) => {
      const href = node.tagName === "a" ? node.properties.href : null;
      if (typeof href !== "string" || !href.startsWith("#") || href.length < 2) return;
      let id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // 잘못된 % 표기는 그대로 둔다
      }
      if (!ids.has(id) && ids.has(schema.clobberPrefix + id)) node.properties.href = "#" + schema.clobberPrefix + id;
    });
  };
}
