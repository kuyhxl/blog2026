// 공개 노트 본문 → HTML과 목차. 빌드 때만 돈다
import fs from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import { slug as headingId } from "github-slugger";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { allNotes, contentDir, posts, type Note } from "./posts.ts";
import { noteKey } from "./obsidian.ts";
import remarkObsidian, { type Resolver } from "./remark-obsidian.ts";
import rehypePost, { type TocItem } from "./rehype-post.ts";
import { rehypeHashLinks, schema } from "./sanitize.ts";
import rehypeSiteUrls from "./site-urls.ts";

function resolver(): Resolver {
  const byKey = new Map(allNotes().map((n) => [noteKey(n.name), n]));
  const assets = path.join(contentDir(), "assets");
  return {
    note(target, heading) {
      const n = byKey.get(noteKey(target));
      if (!n) return null;
      // 빈 노드는 글 페이지가 없으므로 글자로 남긴다
      if (n.empty) return "empty";
      const hash = heading && !heading.startsWith("^") ? "#" + headingId(heading) : "";
      return `/blog/${encodeURIComponent(n.slug)}/${hash}`;
    },
    image(raw) {
      const name = raw.normalize("NFC");
      const file = path.join(assets, name);
      if (!fs.existsSync(file)) return null;
      let width: number | undefined, height: number | undefined;
      try {
        ({ width, height } = imageSize(fs.readFileSync(file)));
      } catch {
        // 크기를 읽지 못하는 그림은 크기 없이 둔다
      }
      return { src: `/assets/${encodeURIComponent(name)}`, width, height };
    },
  };
}

// 사이트에 실제로 있는 주소: 홈, 글 목록, 글(빈 노드 제외), 지도, RSS, content/assets의 그림. 끝의 /는 있어도 없어도 된다
function knownPaths() {
  const dir = path.join(contentDir(), "assets");
  const pages = ["/", "/blog/", "/cs/", ...posts().map((p) => `/blog/${p.slug}/`)];
  const files = ["/rss.xml", ...(fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => `/assets/${f}`) : [])];
  const set = new Set([...pages, ...pages.map((p) => p.replace(/\/$/, "")), ...files]);
  return (pathname: string) => set.has(pathname);
}

export async function renderPost(post: Note): Promise<{ html: string; toc: TocItem[] }> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkObsidian, { resolve: resolver(), file: `content/posts/${post.name}.md` })
    // 각주 id의 앞붙이(user-content-)는 정화 단계가 붙인다. 여기서도 붙이면 두 번 붙는다
    .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: "", footnoteLabel: "각주", footnoteBackLabel: (i) => `${i + 1}번 각주가 달린 자리로` })
    .use(rehypeRaw)
    // 노트에 적힌 HTML은 여기서 정화한다. 이 뒤의 단계가 만드는 것(수식, 코드 색, 그림 틀)은 이 사이트가 만든 것이다
    .use(rehypeSanitize, schema)
    .use(rehypeHashLinks)
    // 마지막 확인: 사이트에 없는 곳을 가리키는 주소가 남았으면 멈춘다
    .use(rehypeSiteUrls, { file: `content/posts/${post.name}.md`, page: `/blog/${encodeURIComponent(post.slug)}/`, known: knownPaths() })
    .use(rehypeKatex)
    .use(rehypePost)
    .use(rehypeStringify)
    .process(post.body);
  return { html: String(file), toc: file.data.toc ?? [] };
}
