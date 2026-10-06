// 공개 노트의 frontmatter 규칙(CLAUDE.md "frontmatter 규칙")과 글 주소 규칙.
// 동기화 스크립트(scripts/sync.ts)와 빌드가 함께 쓴다. Node가 바로 실행하므로 상대 경로와 .ts 확장자로 불러온다
import { parse, stringify } from "yaml";

export const POST_TYPES = ["cs", "troubleshooting", "til", "project"] as const;

// content/에 남기는 필드. 이 밖의 필드는 동기화 때 버린다(비공개 정보가 섞여 들어오지 않게)
export const KEPT_FIELDS = ["title", "date", "type", "tags", "summary", "publish", "slug", "id"] as const;

// 예전 규칙에 있던 CS 노트 필드. 지도의 자리와 선은 data/cs-map-graph.json에서만 읽으므로,
// 적혀 있어도 읽지 않고 버린 필드로 알리지도 않는다
const IGNORED_FIELDS = ["subject", "parent", "prerequisites", "related"];

export type Frontmatter = Record<string, unknown>;

const FM = /^---\r?\n([\s\S]*?)(?:\r?\n)?---[ \t]*(?:\r?\n|$)/;

// 맨 앞의 --- 사이를 YAML로 읽는다. YAML 1.2 기본 규칙이라 날짜는 문자열 그대로 남는다
export function splitFrontmatter(src: string): { data: Frontmatter; body: string } {
  const m = FM.exec(src);
  if (!m) return { data: {}, body: src };
  let data: unknown = null;
  try {
    data = parse(m[1]);
  } catch {
    data = null;
  }
  const ok = !!data && typeof data === "object" && !Array.isArray(data);
  return { data: ok ? (data as Frontmatter) : {}, body: src.slice(m[0].length) };
}

export function isPublic(fm: Frontmatter) {
  return fm.publish === true;
}

// 남길 필드만 KEPT_FIELDS 순서로 다시 적는다. 버린 필드 이름을 함께 돌려준다
export function keepFields(fm: Frontmatter): { yaml: string; dropped: string[] } {
  const kept: Frontmatter = {};
  for (const k of KEPT_FIELDS) if (k in fm) kept[k] = fm[k];
  const dropped = Object.keys(fm).filter((k) => !(KEPT_FIELDS as readonly string[]).includes(k) && !IGNORED_FIELDS.includes(k));
  return { yaml: stringify(kept).trimEnd(), dropped };
}

// 본문이 비어 있으면 "빈 노드"다. 맵에는 흐리게 나오고, 글 페이지·목록·검색에는 나오지 않는다
export function isEmptyBody(body: string) {
  return body.replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "").trim() === "";
}

// 글 주소: CS 노트는 id, 나머지는 slug, 둘 다 없으면 파일 이름(공백은 -로)
// 글 주소는 한글 모양을 합친 모양(NFC)으로 맞춘다. 파일 이름이 나눈 모양(NFD)이어도 링크와 같은 주소가 된다
export function postSlug(fm: Frontmatter, fileBase: string): string {
  if (fm.type === "cs" && typeof fm.id === "string" && fm.id.trim()) return fm.id.trim().normalize("NFC");
  if (fm.type !== "cs" && typeof fm.slug === "string" && fm.slug.trim()) return fm.slug.trim().normalize("NFC");
  return fileBase.trim().replace(/\s+/g, "-").normalize("NFC");
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// 달력에 있는 날짜인가. 형식(YYYY-MM-DD)만 보지 않고 13월이나 2월 30일 같은 날짜도 걸러 낸다
export function isDate(v: unknown): v is string {
  const m = typeof v === "string" ? DATE.exec(v) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
const isStrList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

// 규칙과 다른 점을 사람이 읽을 문장으로 돌려준다. 노트는 고치지 않는다.
// 본문이 빈 CS 노트(빈 노드)는 date와 summary를 비워도 된다
export function checkFrontmatter(fm: Frontmatter, csIds: Set<string>, emptyBody = false): string[] {
  const out: string[] = [];
  const emptyNode = emptyBody && fm.type === "cs";
  if (typeof fm.title !== "string" || !fm.title.trim()) out.push("title이 없다");
  // 빈 노드도 date를 적었다면 달력에 있는 날짜여야 한다
  if (emptyNode ? fm.date != null && fm.date !== "" && !isDate(fm.date) : !isDate(fm.date)) out.push("date가 없거나, YYYY-MM-DD 형식의 달력에 있는 날짜가 아니다");
  if (!(POST_TYPES as readonly unknown[]).includes(fm.type)) out.push(`type이 ${POST_TYPES.join(" | ")} 중 하나가 아니다`);
  if (!isStrList(fm.tags)) out.push("tags가 목록이 아니다");
  if (!emptyNode && (typeof fm.summary !== "string" || !fm.summary.trim())) out.push("summary가 없다");
  if (typeof fm.slug === "string" && /[/?#%\\]/.test(fm.slug)) out.push("slug에 / ? # % \\ 는 쓸 수 없다");
  // CS 노트는 id만 본다. 지도의 자리와 선은 data/cs-map-graph.json이 원본이다
  if (fm.type === "cs") {
    if (typeof fm.id !== "string" || !fm.id) out.push("CS 노트인데 id가 없다");
    else if (!csIds.has(fm.id)) out.push(`id "${fm.id}"가 data/cs-map-graph.json에 없다(지도에 나오지 않는다)`);
  }
  return out;
}
