// 빌드 때 content/의 공개 노트를 읽는다. 볼트에는 접근하지 않는다
import fs from "node:fs";
import path from "node:path";
import { isDate, isEmptyBody, isPublic, postSlug, splitFrontmatter } from "./schema.ts";

export type Note = {
  name: string; // 파일 이름(확장자 없이). 위키링크가 이 이름으로 가리킨다
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: string;
  tags: string[];
  summary: string;
  empty: boolean; // 본문이 비어 있는 CS 노트(빈 노드)
  body: string;
};

// 개발 확인용 가짜 볼트를 볼 때는 CONTENT_DIR=.content-fixture
export const contentDir = () => path.resolve(process.cwd(), process.env.CONTENT_DIR || "content");

export { TYPE_LABEL, formatDate } from "./format.ts";

let cache: { dir: string; notes: Note[] } | null = null;

export function allNotes(): Note[] {
  const dir = path.join(contentDir(), "posts");
  // 개발 중에는 동기화한 내용이 바로 보이도록 매번 읽는다
  if (cache?.dir === dir && process.env.NODE_ENV === "production") return cache.notes;
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  const read = files.map((f) => ({ f, ...splitFrontmatter(fs.readFileSync(path.join(dir, f), "utf8")) }));
  // 동기화는 publish: true인 노트만 옮기지만, 손으로 복사하거나 병합하다 섞여 들어온 노트를 빌드가 한 번 더 막는다.
  // 공개 노트가 아닐 수 있으므로 이름은 알리지 않고 개수만 센다
  const notPublic = read.filter((r) => !isPublic(r.data)).length;
  if (notPublic) throw new Error(`content/posts에 publish: true가 아닌 노트가 ${notPublic}개 있어 빌드를 멈춥니다. npm run sync를 다시 실행해 주세요`);
  // CS가 아닌 글은 slug가 글 주소이자 댓글을 잇는 열쇠라 꼭 있어야 한다. 동기화와 같은 확인으로, 손으로 content/에 넣은 글도 막는다.
  // 여기까지 온 노트는 모두 공개 글이므로 경로를 알린다. 본문이 빈 노트는 글 페이지가 없으므로 따지지 않는다
  const noSlug = read.filter(({ data, body }) => data.type !== "cs" && !isEmptyBody(body) && !(typeof data.slug === "string" && data.slug.trim())).map((r) => `content/posts/${r.f}`);
  if (noSlug.length) {
    throw new Error(`본문이 있는 글 가운데 CS 노트가 아닌데 slug가 없는 글이 있어 빌드를 멈춥니다. 볼트에서 slug를 적은 뒤 npm run sync를 다시 실행해 주세요:\n${noSlug.map((p) => "  - " + p).join("\n")}`);
  }
  const notes = read.map(({ f, data, body }): Note => {
    // 한글 모양을 합친 모양(NFC)으로 맞춘다. 위키링크, 글 주소, 태그 거르기가 같은 글자를 같게 본다
    const name = f.slice(0, -3).normalize("NFC");
    const empty = isEmptyBody(body);
    const date = typeof data.date === "string" ? data.date : "";
    // 날짜는 RSS, 글 목록의 정렬, 이전·다음 글에 쓰인다. 빈 노드가 아니면 꼭 있어야 하고, 적었다면 달력에 있는 날짜여야 한다
    if ((!empty || date) && !isDate(date)) throw new Error(`content/posts/${f}: date가 없거나, YYYY-MM-DD 형식의 달력에 있는 날짜가 아닙니다(예: 2026-13-40)`);
    return {
      name,
      slug: postSlug(data, name),
      title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : name,
      date,
      type: typeof data.type === "string" ? data.type : "",
      tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t).normalize("NFC")) : [],
      summary: typeof data.summary === "string" ? data.summary.trim() : "",
      empty,
      body,
    };
  });
  const seen = new Map<string, string>();
  for (const n of notes) {
    if (seen.has(n.slug)) throw new Error(`글 주소 /blog/${n.slug}/ 가 겹칩니다: ${seen.get(n.slug)}, ${n.name}`);
    seen.set(n.slug, n.name);
  }
  notes.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "ko"));
  cache = { dir, notes };
  return notes;
}

// 글 페이지가 있는 노트: 빈 노드는 빠진다
export const posts = () => allNotes().filter((n) => !n.empty);

export const findPost = (slug: string) => posts().find((p) => p.slug === slug);
