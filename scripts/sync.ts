// 볼트에서 publish: true 노트와 그 노트가 쓰는 이미지만 content/로 복사한다. 볼트에는 읽기만 한다.
// 비공개 노트는 제목도 내용도 파일 이름도 content/와 이 스크립트의 출력에 남기지 않는다(개수만 센다).
//
// 실행: npm run sync           볼트 경로는 .env.local의 VAULT_PATH, 결과는 content/
//       npm run sync:fixture   가짜 볼트(scripts/fixtures/vault) → .content-fixture/ (개발 확인용)
// 옵션: --vault <경로> --out <경로>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Definition, Nodes, Parent } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { toString } from "mdast-util-to-string";
import { SKIP, visit } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { checkFrontmatter, isEmptyBody, isPublic, keepFields, postSlug, splitFrontmatter } from "../lib/content/schema.ts";
import { IMAGE_EXT, WIKILINK, baseName, inRanges, literalRanges, nfc, noteKey, parseWikilink } from "../lib/content/obsidian.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  console.error(`\n동기화를 멈췄습니다. content/는 바꾸지 않았습니다.\n${msg}\n`);
  process.exit(2);
}

// ── 볼트 훑기 ───────────────────────────────────────────────────────────────
// 점으로 시작하는 폴더(.obsidian, .trash, .git)는 보지 않는다.
// iCloud가 아직 내려받지 않은 파일은 ".이름.icloud" 자리표시 파일로 있거나(이전 방식),
// 이름은 그대로지만 내용이 없는 "dataless" 파일로 있다(요즘 macOS). 둘 다 찾아낸다
type Scan = { notes: string[]; files: string[]; stubs: string[] };

function scan(dir: string, out: Scan = { notes: [], files: [], stubs: [] }): Scan {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith(".")) scan(abs, out);
      continue;
    }
    if (!e.isFile()) continue;
    const stub = /^\.(.+)\.icloud$/.exec(e.name);
    if (stub) out.stubs.push(path.join(dir, stub[1]));
    else if (e.name.startsWith(".")) continue;
    else if (/\.md$/i.test(e.name)) out.notes.push(abs);
    else out.files.push(abs);
  }
  return out;
}

// 내용이 아직 이 기기에 없는 파일(SF_DATALESS 플래그). 읽으면 내려받기가 시작되므로 읽기 전에 확인한다
function dataless(paths: string[]): Set<string> {
  const out = new Set<string>();
  if (process.platform !== "darwin") return out;
  for (let i = 0; i < paths.length; i += 200) {
    const batch = paths.slice(i, i + 200);
    let res: string;
    try {
      res = execFileSync("/usr/bin/stat", ["-f", "%Xf", ...batch], { encoding: "utf8" });
    } catch {
      fail("볼트 파일의 상태를 읽지 못했습니다. 볼트 경로와 iCloud 상태를 확인해 주세요.");
    }
    res.trim().split("\n").forEach((flags, j) => {
      if ((parseInt(flags, 16) & 0x40000000) !== 0) out.add(batch[j]);
    });
  }
  return out;
}

// ── 본문 바꾸기 ─────────────────────────────────────────────────────────────
// 원문 위치를 기준으로 "지울 곳·바꿀 곳·멈출 곳"을 모은 뒤 한 번에 적용한다. 그래서 멈출 곳의 줄 번호가 원문과 맞는다.
// 코드와 수식 안은 건드리지 않는다

type Span = [number, number];
type Edit = [number, number, string];

// Obsidian 주석(%%…%%)과 HTML 주석은 화면에 보이지 않는 메모라서 지운다. 닫히지 않은 %%는 끝까지 지운다
function commentSpans(md: string, literal: Span[]): Span[] {
  const spans: Span[] = [];
  const marks: number[] = [];
  for (let i = md.indexOf("%%"); i >= 0; i = md.indexOf("%%", i + 2)) if (!inRanges(i, literal)) marks.push(i);
  for (let k = 0; k < marks.length; k += 2) spans.push([marks[k], k + 1 < marks.length ? marks[k + 1] + 2 : md.length]);
  for (const m of md.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) if (!inRanges(m.index, literal)) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

function applyEdits(md: string, edits: Edit[]) {
  edits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let out = "", at = 0;
  for (const [s, e, text] of edits) {
    if (e <= at) continue; // 이미 지운 주석 안
    out += md.slice(at, Math.max(at, s)) + (s >= at ? text : "");
    at = e;
  }
  return out + md.slice(at);
}

// 첨부 파일 찾기 결과: 파일 하나, 같은 이름이 여럿이라 정할 수 없음, 없음
type Found = { file: string } | "ambiguous" | null;

type NoteCtx = {
  isPublicNote: (target: string) => boolean;
  noteExists: (target: string) => boolean; // 볼트에 그런 노트가 있는가(공개 여부와 상관없이). 이름은 밖으로 내보내지 않는다
  attachment: (link: string) => Found;
  asset: (file: string) => string | null; // 그림 파일을 content/assets에 둘 이름. 다른 파일이 이미 그 이름(대소문자만 다른 것 포함)을 쓰면 null
  images: Map<string, { file: string; at: number }>; // 이 글이 쓰는 그림: content/assets에 둘 이름 → 볼트 안의 파일, 처음 쓴 곳
  aliased: { at: number; text: string }[]; // 링크를 없애고 별칭만 남긴 곳
  stops: number[]; // 별칭 없이 공개 노트가 아닌 노트를 가리키는 곳. 하나라도 있으면 동기화를 멈춘다
  ambiguous: number[]; // 어느 파일인지 정할 수 없는 그림. 멈춘다
  htmlStops: number[]; // HTML 안이나 글자로 남는 링크 모양에서 볼트 안을 가리키는 주소. 멈춘다
  missing: string[];
  unsupported: string[];
};

function decode(u: string) {
  try {
    return decodeURIComponent(u);
  } catch {
    return u; // 잘못된 % 표기는 그대로 둔다
  }
}

// 주소를 브라우저가 읽는 대로 다듬는다: 앞뒤의 공백·제어 문자를 떼고, 사이의 탭·줄바꿈은 지우고, \ 는 / 로 본다
const tidyUrl = (raw: string) => raw.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "").replace(/[\t\n\r]/g, "").replace(/\\/g, "/");

// 경로와 #제목으로 나눈다. ? 뒤(쿼리)는 경로가 아니므로 버린다
function splitUrl(u: string) {
  const h = u.indexOf("#");
  const head = h < 0 ? u : u.slice(0, h);
  const q = head.indexOf("?");
  return { file: decode(q < 0 ? head : head.slice(0, q)), hash: h < 0 ? "" : decode(u.slice(h + 1)) };
}

type Lookup = Pick<NoteCtx, "noteExists" | "attachment">;

// 마크다운·HTML 주소 가운데 볼트 안의 노트나 파일을 가리키는 것. 바깥 주소, 같은 글 안의 #제목, 사이트 안 주소(/blog/…)는 null.
// 쿼리(?…), % 표기, 탭, 역슬래시 같은 꾸밈을 걷어 낸 뒤에 판단한다. HTML의 문자 참조(&#46; 등)는 htmlUrls가 먼저 푼다
type Dest = { file: string; hash: string; name: string; note: boolean };
function vaultDest(raw: string, c: Lookup): Dest | null {
  const u = tidyUrl(raw);
  if (!u || u.startsWith("#")) return null;
  const dest = (file: string, hash: string): Dest => {
    const name = baseName(file);
    return { file, hash, name, note: /\.md$/i.test(name) || !/\.[a-z0-9]+$/i.test(name) };
  };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1].toLowerCase();
  // Obsidian 주소(obsidian://open?vault=…&file=…)와 이 컴퓨터의 파일 주소(file://…)는 볼트를 가리킨다.
  // 공개 노트로 이어지지 않으면 비공개 노트를 가리키는 링크와 같게 다룬다(파일을 알 수 없으면 빈 이름)
  if (scheme === "obsidian") {
    let file = "";
    try {
      const q = new URL(u).searchParams;
      file = q.get("file") ?? q.get("filepath") ?? "";
      const abs = q.get("path");
      if (!file && abs && path.resolve(abs).startsWith(vault + path.sep)) file = vaultRel(path.resolve(abs));
    } catch {
      // 읽을 수 없는 주소는 빈 이름으로 둔다
    }
    return dest(file, "");
  }
  if (scheme === "file") {
    let file = "";
    try {
      const abs = decode(new URL(u).pathname);
      if (abs.startsWith(vault + path.sep)) file = vaultRel(abs);
    } catch {
      // 읽을 수 없는 주소는 빈 이름으로 둔다
    }
    return dest(file, "");
  }
  if (scheme) return null; // https:, mailto: 같은 바깥 주소
  // //로 시작하면 브라우저는 다른 사이트 주소로 읽는다. 다만 볼트에 그런 경로가 있으면 볼트를 가리킨 것으로 본다
  const other = u.startsWith("//");
  const { file, hash } = splitUrl(other ? u.replace(/^\/+/, "/") : u);
  const d = dest(file, hash);
  const exists = c.noteExists(file) || !!c.attachment(file);
  if (other) return exists ? d : null;
  // /로 시작하는 주소는 사이트 안 주소일 수도, 볼트 맨 위에서부터 적은 경로일 수도 있다. 볼트에 그런 노트나 파일이 있거나 .md로 끝날 때만 볼트 안으로 본다
  if (file.startsWith("/") && !/\.md$/i.test(d.name) && !exists) return null;
  return d;
}

// HTML 속 주소. 정규식이 아니라 HTML 파서로 읽어서 브라우저와 같게 문자 참조(&#46;)를 풀고, 따옴표·대소문자·띄어쓰기 차이도 흡수한다
// - 주소를 담는 속성(아래 목록), style 속성의 url(…), <meta http-equiv="refresh">의 url=
// - HTML 덩어리 안에 글자로 남은 마크다운 링크 [글자](주소). 화면에 글자로 그대로 보인다
const URL_PROPS = new Set(["href", "src", "srcSet", "imageSrcSet", "poster", "data", "action", "formAction", "cite", "background", "longDesc", "lowSrc", "useMap", "manifest", "ping", "icon", "codeBase", "classId", "archive", "profile", "itemId", "xLinkHref"]);
const MD_DEST = /\]\(\s*<?([^)\s>]+)/g;
function htmlUrls(src: string): { at: number; url: string }[] {
  const out: { at: number; url: string }[] = [];
  visit(fromHtml(src, { fragment: true }), (n) => {
    const at = n.position?.start.offset ?? 0;
    if (n.type === "text") {
      // 글자 안에서의 자리를 더한다(문자 참조가 있으면 원문과 조금 어긋날 수 있지만 줄은 거의 맞는다)
      for (const m of n.value.matchAll(MD_DEST)) out.push({ at: at + m.index, url: m[1] });
      return;
    }
    if (n.type !== "element") return;
    for (const [k, v] of Object.entries(n.properties)) {
      if (v == null || v === false) continue;
      const values = (Array.isArray(v) ? v : [v]).map(String);
      for (const value of values) {
        // srcset="a.png 1x, b.png 2x"
        if (URL_PROPS.has(k)) out.push({ at, url: /srcset$/i.test(k) ? value.trim().split(/\s+/)[0] : value });
        else if (k === "style") for (const m of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) out.push({ at, url: m[2] });
        else if (k === "content" && n.tagName === "meta") for (const m of value.matchAll(/url\s*=\s*['"]?([^'";\s]+)/gi)) out.push({ at, url: m[1] });
      }
    }
  });
  return out;
}

const parse = (md: string) => unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(md);
const span = (n: Nodes): Span => [n.position?.start.offset ?? 0, n.position?.end.offset ?? 0];
// 위키링크의 표시 이름이나 그림 설명으로 넣을 글자: 링크 문법을 깨는 글자와 줄바꿈을 뺀다
const plainText = (t: string) => t.replace(/\s*\n\s*/g, " ").replace(/[[\]|]/g, "").trim();

// 공개 노트가 아닌 노트(비공개이거나 볼트에 없는 노트)를 가리키는 링크:
// - 별칭이 있으면 별칭만 글자로 남긴다
// - 별칭이 없거나 본문 끼워 넣기(![[…]])면 멈춘다. 노트 이름은 어디에도 남기지 않는다
// 볼트에 없는 노트도 같은 규칙을 쓴다. Obsidian은 비공개 노트의 aliases로도 링크를 이어 주므로, 동기화가 "없다"고 본 이름이 비공개 노트의 다른 이름일 수 있다
function rewriteBody(body: string, c: NoteCtx) {
  const literal = literalRanges(body);
  const comments = commentSpans(body, literal);
  const skip = (i: number) => inRanges(i, literal) || inRanges(i, comments);
  const edits: Edit[] = comments.map(([s, e]) => [s, e, ""]);
  const taken: Span[] = [];

  // 그림 하나를 쓰고, 본문에 적을 이름을 돌려준다. 이름은 링크에 적힌 대로가 아니라 볼트의 실제 파일 이름이다.
  // 그래서 ![[diagram.svg]]와 ![[DIAGRAM.svg]]가 같은 파일이면 본문과 content/assets 모두 diagram.svg 하나로 맞는다(대소문자를 가리는 호스팅에서도 깨지지 않는다).
  // content/assets에는 파일 이름만으로 놓이므로, 다른 폴더의 같은 이름 그림을 함께 쓰면 멈춘다
  const takeImage = (link: string, at: number) => {
    const f = c.attachment(link);
    if (f === "ambiguous") c.ambiguous.push(at);
    else if (!f) c.missing.push(baseName(link));
    else {
      const name = c.asset(f.file);
      if (!name) c.ambiguous.push(at);
      else {
        if (!c.images.has(name)) c.images.set(name, { file: f.file, at });
        return name;
      }
    }
    return baseName(link);
  };

  for (const m of body.matchAll(WIKILINK)) {
    if (skip(m.index)) continue;
    const at = m.index;
    const replace = (text: string) => {
      edits.push([at, at + m[0].length, text]);
      taken.push([at, at + m[0].length]);
    };
    const embed = m[1] === "!";
    const sep = m[2].includes("\\|") ? "\\|" : "|";
    const { target, heading, alias } = parseWikilink(m[2]);
    const name = baseName(target);
    if (!target) {
      // [[#제목]]은 같은 글 안의 제목. 같은 글의 일부를 끼워 넣는 ![[#제목]]은 뺀다
      if (embed) replace("");
      continue;
    }
    if (embed && IMAGE_EXT.test(name)) {
      replace(`![[${takeImage(target, at)}${alias ? sep + alias : ""}]]`);
    } else if (c.isPublicNote(target)) {
      replace(`${embed ? "!" : ""}[[${nfc(name.replace(/\.md$/i, ""))}${heading ? "#" + heading : ""}${alias ? sep + alias : ""}]]`);
    } else if (!/\.md$/i.test(name) && c.attachment(target)) {
      // 그림이 아닌 첨부 파일(PDF 등)은 아직 다루지 않는다. 파일 이름만 글자로 남긴다
      c.unsupported.push(name);
      replace(alias ?? name);
    } else if (!embed && alias) {
      c.aliased.push({ at, text: alias });
      replace(alias);
    } else {
      c.stops.push(at);
    }
  }

  // 마크다운 링크와 그림. 정규식이 아니라 문법 트리로 읽어서 [글자](주소 "설명"), [글자](<주소>), 참조형 [글자][이름]과 그 정의 [이름]: 주소까지 다룬다
  const tree = parse(body);
  const defs = new Map<string, Definition>();
  visit(tree, "definition", (d) => {
    if (!defs.has(d.identifier)) defs.set(d.identifier, d);
  });
  const within = ([s, e]: Span) => taken.some(([a, b]) => s >= a && e <= b);
  const crosses = ([s, e]: Span) => taken.some(([a, b]) => s < b && e > a);

  visit(tree, (node) => {
    if (!node.position || node.type === "root") return;
    const [s, e] = span(node);
    // 코드·수식·주석 안에서 시작하는 링크·그림·글자·HTML은 건너뛴다.
    // 문단이나 목록처럼 감싸는 것은 첫머리가 코드나 주석이어도 건너뛰지 않고 안을 계속 본다(감싸는 것 자체는 바꿀 것이 없다)
    if (skip(s)) return "children" in node && node.type !== "link" && node.type !== "linkReference" ? undefined : SKIP;

    // HTML: 볼트 안을 가리키는 주소가 있으면 멈춘다. 위키링크나 마크다운 문법으로 쓰면 위의 규칙을 따른다
    if (node.type === "html") {
      for (const { at, url } of htmlUrls(body.slice(s, e))) if (vaultDest(url, c)) c.htmlStops.push(s + at);
      return;
    }
    // 글자로 남아 화면에 그대로 보이는 링크 모양도 같다: 따옴표 없는 속성 등으로 HTML로 읽히지 않은 태그(<a href=/경로>), 역슬래시로 막은 링크(\[글자](경로))
    if (node.type === "text") {
      if (/<[a-z]|\]\(/i.test(node.value)) for (const { at, url } of htmlUrls(node.value)) if (vaultDest(url, c)) c.htmlStops.push(s + at);
      return;
    }
    // 정의 [이름]: 주소 는 화면에 보이지 않지만 content/에 남는다. 볼트 안을 가리키면 지운다(쓰는 곳은 아래에서 글자나 위키링크로 바뀐다)
    if (node.type === "definition") {
      if (vaultDest(node.url, c)) edits.push([s, e, ""]);
      return;
    }
    let url: string | undefined;
    if (node.type === "link" || node.type === "image") url = node.url;
    else if (node.type === "linkReference" || node.type === "imageReference") url = defs.get(node.identifier)?.url;
    else return;
    if (url == null || within([s, e])) return SKIP;
    const d = vaultDest(url, c);
    if (!d) return; // 바깥·사이트 주소는 그대로 둔다. 안쪽의 위키링크는 위에서 따로 다뤘다
    // 링크 글자 안에 위키링크가 들어 있는 경우처럼 바꿀 곳이 겹치면, 무엇이 남을지 장담할 수 없으므로 멈춘다
    if (crosses([s, e])) {
      c.stops.push(s);
      return SKIP;
    }
    const image = node.type === "image" || node.type === "imageReference";
    const text = plainText(image ? (node.alt ?? "") : toString(node as Parent));
    const wiki = () => `[[${nfc(d.name.replace(/\.md$/i, ""))}${d.hash ? "#" + d.hash : ""}|${text}]]`;
    if (image && !d.note && IMAGE_EXT.test(d.name)) {
      edits.push([s, e, `![${text}](${encodeURI(takeImage(d.file, s))})`]);
    } else if (d.note && c.isPublicNote(d.file)) {
      edits.push([s, e, wiki()]);
    } else if (d.note) {
      if (text && !image) {
        c.aliased.push({ at: s, text });
        edits.push([s, e, text]);
      } else c.stops.push(s);
    } else {
      c.unsupported.push(d.name);
      edits.push([s, e, text || d.name]);
    }
    taken.push([s, e]);
    return SKIP;
  });

  return applyEdits(body, edits);
}

// 바꾼 뒤에 남아도 되는 마크다운·HTML 주소: 바깥 주소, 같은 글 안의 #제목, 사이트 안 주소(/blog/…), 그리고 그림의 파일 이름(폴더 없이).
// 판단은 바꿀 때와 같은 vaultDest로 한다
function leftoverUrl(url: string, image: boolean) {
  const d = vaultDest(url, rootLookup);
  return !!d && !(image && !d.file.includes("/") && IMAGE_EXT.test(d.name));
}

// 자체 검사: 모든 노트가 publish: true인가, 노트 사이에 없는 노트를 가리키는 위키링크와 볼트 안을 가리키는 주소가 남지 않았는가. 개수만 센다
function selfCheck(notes: Map<string, string>) {
  const names = new Set([...notes.keys()].map(noteKey));
  let notPublic = 0, dangling = 0, paths = 0;
  for (const src of notes.values()) {
    const { data, body } = splitFrontmatter(src);
    if (!isPublic(data)) notPublic++;
    const literal = literalRanges(body);
    for (const m of body.matchAll(WIKILINK)) {
      if (inRanges(m.index, literal)) continue;
      const { target } = parseWikilink(m[2]);
      if (!target || (m[1] === "!" && IMAGE_EXT.test(target))) continue;
      if (!names.has(noteKey(target))) dangling++;
    }
    visit(parse(body), (node) => {
      if (node.type === "link" || node.type === "definition") paths += +leftoverUrl(node.url, false);
      else if (node.type === "image") paths += +leftoverUrl(node.url, true);
      else if (node.type === "html" || (node.type === "text" && /<[a-z]|\]\(/i.test(node.value))) for (const { url } of htmlUrls(node.value)) paths += +leftoverUrl(url, false);
    });
  }
  return { notPublic, dangling, paths };
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const vaultArg = arg("--vault") ?? process.env.VAULT_PATH;
if (!vaultArg) fail("볼트 경로가 없습니다. .env.local에 VAULT_PATH를 적어 주세요(.env.local.example 참고).");
const vault = path.resolve(ROOT, vaultArg);
const out = path.resolve(ROOT, arg("--out") ?? process.env.CONTENT_DIR ?? "content");
if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) fail("VAULT_PATH가 가리키는 폴더가 없습니다.");
const inside = (a: string, b: string) => a === b || a.startsWith(b + path.sep);
if (inside(out, vault) || inside(vault, out)) fail("볼트와 결과 폴더가 겹칩니다. 볼트에는 아무것도 쓰지 않습니다.");

const found = scan(vault);
const less = dataless(found.notes);
const pendingNotes = found.stubs.filter((p) => /\.md$/i.test(p)).length + less.size;
if (pendingNotes > 0) {
  fail(
    `iCloud에서 아직 내려받지 않은 노트가 ${pendingNotes}개 있습니다.\n` +
      "이대로 진행하면 그 안의 공개 노트가 비공개로 보여 content/에서 지워질 수 있습니다.\n" +
      "Finder에서 볼트 폴더를 오른쪽 클릭해 '지금 다운로드'를 누른 뒤 다시 실행해 주세요.",
  );
}

// 공개 노트 고르기. 비공개 노트는 여기서 개수만 남기고 잊는다
const publicNotes = new Map<string, { file: string; rel: string; name: string; src: string }>();
const dupNames = new Set<string>();
let privateCount = 0;
for (const file of found.notes) {
  const src = fs.readFileSync(file, "utf8");
  if (!isPublic(splitFrontmatter(src).data)) {
    privateCount++;
    continue;
  }
  // 이름은 합친 모양(NFC)으로 맞춘다. content/에도 이 이름으로 쓴다
  const name = nfc(path.basename(file, path.extname(file)));
  const key = noteKey(name);
  if (publicNotes.has(key)) dupNames.add(name);
  publicNotes.set(key, { file, rel: path.relative(vault, file), name, src });
}
if (dupNames.size) fail(`같은 이름의 공개 노트가 둘 이상 있습니다: ${[...dupNames].join(", ")}`);

// 볼트 안의 경로(/로 나눔). 찾을 때는 대소문자를 가리지 않는다(Obsidian과 같다)
const vaultRel = (abs: string) => path.relative(vault, abs).split(path.sep).join("/");
// 한글 모양(NFC)과 대소문자를 맞춘 경로. 견주는 데만 쓴다
const lowerKey = (p: string) => nfc(path.posix.normalize(p.replace(/\\/g, "/").replace(/^\/+/, ""))).toLowerCase();

// 첨부 파일: 볼트 안의 경로 → 파일, 파일 이름 → 파일들. 내려받지 않은 파일도 이름은 알 수 있다
const filesByPath = new Map<string, string>();
const filesByName = new Map<string, string[]>();
for (const f of [...found.files, ...found.stubs.filter((p) => !/\.md$/i.test(p))]) {
  filesByPath.set(lowerKey(vaultRel(f)), f);
  const k = nfc(path.basename(f)).toLowerCase();
  filesByName.set(k, [...(filesByName.get(k) ?? []), f]);
}
// 모든 노트(비공개 포함)의 볼트 안 경로와 이름. "볼트에 그런 노트가 있는가"만 묻고, 밖으로 내보내지 않는다
const notePaths = new Set([...found.notes, ...found.stubs.filter((p) => /\.md$/i.test(p))].map((f) => lowerKey(vaultRel(f)).replace(/\.md$/, "")));
const noteNames = new Set([...notePaths].map((p) => p.split("/").pop()!));

// 링크가 가리키는 첨부 파일. 링크에 적힌 경로를 먼저 따른다:
// - ./ 나 ../ 로 시작하면 이 노트의 폴더에서부터
// - 폴더가 적혀 있으면 볼트 맨 위에서부터, 없으면 이 노트의 폴더에서부터, 그래도 없으면 그 경로로 끝나는 파일
// - 파일 이름만 있으면 그 이름의 파일
// 후보가 둘 이상이면 어느 파일인지 정할 수 없으므로 "ambiguous"(동기화를 멈춘다)
function findAttachment(link: string, noteRel: string): Found {
  const p = link.replace(/\\/g, "/");
  const dir = path.posix.dirname(noteRel);
  const hit = (k: string) => filesByPath.get(lowerKey(k));
  const cands = new Set<string>();
  if (/^\.\.?\//.test(p)) {
    const f = hit(path.posix.join(dir, p));
    return f ? { file: f } : null;
  }
  const bare = p.replace(/^\/+/, "");
  if (bare.includes("/")) for (const f of [hit(bare), hit(path.posix.join(dir, bare))]) if (f) cands.add(f);
  if (!cands.size) {
    const tail = "/" + lowerKey(bare);
    for (const f of filesByName.get(nfc(baseName(bare)).toLowerCase()) ?? []) {
      const r = lowerKey(vaultRel(f));
      if (!bare.includes("/") || r === lowerKey(bare) || r.endsWith(tail)) cands.add(f);
    }
  }
  if (cands.size > 1) return "ambiguous";
  return cands.size ? { file: [...cands][0] } : null;
}

const noteExists = (t: string) => {
  const k = lowerKey(t).replace(/\.md$/, "");
  return notePaths.has(k) || (!k.includes("/") && noteNames.has(k));
};
// 노트 밖(볼트 맨 위)에서 보는 찾기. 자체 검사가 쓴다
const rootLookup: Lookup = { noteExists, attachment: (link) => findAttachment(link, "") };

// content/assets에 놓을 그림: 소문자 이름 → 실제 파일 이름과 볼트 안의 파일. 모든 공개 글이 함께 쓴다
const assets = new Map<string, { name: string; file: string }>();
function assetName(file: string) {
  const name = nfc(path.basename(file));
  const had = assets.get(name.toLowerCase());
  if (had && had.file !== file) return null;
  if (!had) assets.set(name.toLowerCase(), { name, file });
  return name;
}

const graph = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cs-map-graph.json"), "utf8")) as { nodes: { id: string }[] };
const csIds = new Set(graph.nodes.map((n) => n.id));

type Result = { name: string; rel: string; cs: boolean; slug: string; text: string; ctx: NoteCtx; issues: string[]; dropped: string[]; slugFromName: boolean; noSlug: boolean; where: (at: number) => string };
const results: Result[] = [];
for (const n of [...publicNotes.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
  const { data, body } = splitFrontmatter(n.src);
  const noteRel = vaultRel(n.file);
  const ctx: NoteCtx = {
    // 폴더가 적힌 링크는 그 경로의 노트일 때만 공개 노트로 본다. 같은 이름의 비공개 노트를 가리킨 것일 수 있다
    isPublicNote: (t) => {
      const p = publicNotes.get(noteKey(t));
      if (!p) return false;
      const want = lowerKey(t).replace(/\.md$/, "");
      if (!want.includes("/")) return true;
      const have = lowerKey(vaultRel(p.file)).replace(/\.md$/, "");
      return have === want || have.endsWith("/" + want) || have === lowerKey(path.posix.join(path.posix.dirname(noteRel), t)).replace(/\.md$/, "");
    },
    noteExists,
    attachment: (link) => findAttachment(link, noteRel),
    asset: assetName,
    images: new Map(), aliased: [], stops: [], ambiguous: [], htmlStops: [], missing: [], unsupported: [],
  };
  const md = rewriteBody(body, ctx);
  // 원문(볼트의 파일)에서의 "경로:줄"
  const headLines = n.src.length - body.length ? n.src.slice(0, n.src.length - body.length).split("\n").length - 1 : 0;
  const where = (at: number) => `${n.rel}:${headLines + body.slice(0, at).split("\n").length}`;
  const { yaml, dropped } = keepFields(data);
  const slug = postSlug(data, n.name);
  const empty = isEmptyBody(md);
  results.push({
    name: n.name, rel: n.rel, cs: data.type === "cs", slug, ctx, dropped,
    text: `---\n${yaml}\n---\n${md}`,
    issues: checkFrontmatter(data, csIds, empty),
    slugFromName: slug === n.name.trim().replace(/\s+/g, "-"),
    // CS가 아닌 글은 slug가 글 주소이자 댓글을 잇는 열쇠라 꼭 있어야 한다. 본문이 빈 노트는 글 페이지가 없으므로 따지지 않는다
    noSlug: data.type !== "cs" && !empty && !(typeof data.slug === "string" && data.slug.trim()),
    where,
  });
}

// 글 주소(/blog/<slug>/, CS 노트는 /blog/<id>/)가 겹치는 곳. 대소문자만 달라도 겹친 것으로 본다
// (대소문자를 가리지 않는 파일 시스템에서 빌드하면 한쪽 페이지가 다른 쪽을 덮는다)
const bySlug = new Map<string, Result[]>();
for (const r of results) bySlug.set(r.slug.toLowerCase(), [...(bySlug.get(r.slug.toLowerCase()) ?? []), r]);
const slugClash = [...bySlug.values()].filter((v) => v.length > 1).map((v) => `/blog/${v[0].slug}/ ← ${v.map((r) => r.rel).join(", ")}`);
// CS가 아닌 글의 slug가 지도의 개념 id와 같은 곳. 그 개념의 CS 글이 공개되면 주소가 겹치므로, 아직 공개 전이어도 막는다
const csKeys = new Set([...csIds].map((id) => id.toLowerCase()));
const idClash = results.filter((r) => !r.cs && csKeys.has(r.slug.toLowerCase())).map((r) => `${r.rel} → slug "${r.slug}"`);

// 멈춰야 하는 곳을 종류별로 모아 한 번에 알린다. 한 번 고치고 다시 돌릴 때 다음 문제가 새로 나오지 않게 한다
const blocked = (
  [
    [
      "글 주소가 겹치는 공개 글이 있습니다(slug끼리, 또는 CS 노트의 id와 겹침. 대소문자만 달라도 겹칩니다). 한쪽의 slug를 바꿔 주세요.",
      slugClash,
    ],
    [
      "slug가 Beauty of CS 지도의 개념 id(data/cs-map-graph.json)와 같은 글이 있습니다. 그 개념의 CS 글이 공개되면 주소가 겹치므로 slug를 바꿔 주세요.",
      idClash,
    ],
    [
      "본문이 있는 공개 글 가운데 CS 노트가 아닌데 slug가 없는 글이 있습니다. 그 글은 내보내지 않습니다.\n" +
        "frontmatter에 slug를 적은 뒤 다시 실행해 주세요(글 주소 /blog/<slug>/가 되고, 댓글도 이 값으로 이어집니다).",
      results.filter((r) => r.noSlug).map((r) => r.rel),
    ],
    [
      "공개 노트가 아닌 노트를 별칭 없이 가리키는 링크나 끼워 넣기(![[…]])가 있습니다.\n" +
        "링크에 별칭을 붙이거나([[노트|보일 글자]]) 링크를 지운 뒤 다시 실행해 주세요. 끼워 넣기는 지워야 합니다.",
      results.flatMap((r) => r.ctx.stops.map(r.where)),
    ],
    [
      "어느 파일을 가리키는지 정할 수 없는 그림이 있습니다. 볼트에 같은 이름의 파일이 둘 이상 있거나, 다른 폴더의 같은 이름 그림을 함께 씁니다.\n" +
        "링크에 폴더 경로를 함께 적어 주세요(예: ![[폴더/그림.png]]). 같은 이름의 다른 그림을 함께 쓰려면 한쪽 파일 이름을 바꿔 주세요.",
      results.flatMap((r) => r.ctx.ambiguous.map(r.where)),
    ],
    [
      "HTML 안이나 글자로 남는 링크 모양(따옴표 없는 태그, \\[글자](경로) 등)에서 볼트 안의 노트나 파일을 가리키는 주소가 있습니다. 이런 주소는 바꾸지 않으므로 그대로 내보낼 수 없습니다.\n" +
        "위키링크([[노트|보일 글자]], ![[그림.png]])나 마크다운 문법으로 바꾼 뒤 다시 실행해 주세요.",
      results.flatMap((r) => r.ctx.htmlStops.map(r.where)),
    ],
  ] as [string, string[]][]
).filter(([, at]) => at.length);
if (blocked.length) fail(blocked.map(([why, at]) => why + "\n" + at.map((s) => "  - " + s).join("\n")).join("\n\n"));


// 공개 글이 쓰는 이미지: content/assets에 둘 이름 → 볼트 안의 파일. 다른 폴더의 같은 이름 그림은 위에서 이미 멈췄다
const images = new Map<string, string>();
for (const r of results) for (const [k, v] of r.ctx.images) images.set(k, v.file);
// 공개 글이 쓰는 이미지 가운데 아직 내려받지 않은 것
const imageLess = dataless([...images.values()].filter((p) => fs.existsSync(p)));
const pendingImages = [...images.entries()].filter(([, p]) => !fs.existsSync(p) || imageLess.has(p)).map(([k]) => k);
if (pendingImages.length) {
  fail(`공개 글이 쓰는 이미지 가운데 iCloud에서 아직 내려받지 않은 것이 있습니다:\n${pendingImages.map((n) => "  - " + n).join("\n")}\nFinder에서 내려받은 뒤 다시 실행해 주세요.`);
}

// 쓰기 전 자체 검사. 통과하지 못하면 쓰지 않는다
const before = selfCheck(new Map(results.map((r) => [r.name, r.text])));
if (before.notPublic || before.dangling || before.paths) {
  fail(`자체 검사를 통과하지 못했습니다: publish: true가 아닌 노트 ${before.notPublic}개, 없는 노트를 가리키는 위키링크 ${before.dangling}개, 볼트 안을 가리키는 주소 ${before.paths}개`);
}

// 쓰기: 바뀐 파일만 쓰고, 이번에 없는 파일은 지운다
function mirror(dir: string, files: Map<string, string | Buffer>) {
  fs.mkdirSync(dir, { recursive: true });
  const removed: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!files.has(f)) {
      fs.rmSync(path.join(dir, f), { recursive: true, force: true });
      removed.push(f);
    }
  }
  for (const [f, data] of files) {
    const p = path.join(dir, f);
    const same = fs.existsSync(p) && Buffer.compare(fs.readFileSync(p), Buffer.from(data)) === 0;
    if (!same) fs.writeFileSync(p, data);
  }
  return removed;
}
const removedPosts = mirror(path.join(out, "posts"), new Map(results.map((r) => [r.name + ".md", r.text])));
mirror(path.join(out, "assets"), new Map([...images.entries()].map(([k, v]) => [k, fs.readFileSync(v)])));

// 쓴 뒤 자체 검사: content/에 실제로 남은 파일을 다시 읽는다
const postsDir = path.join(out, "posts");
const written = new Map(fs.readdirSync(postsDir).filter((f) => f.endsWith(".md")).map((f) => [f.slice(0, -3), fs.readFileSync(path.join(postsDir, f), "utf8")]));
const after = selfCheck(written);

// ── 보고 ────────────────────────────────────────────────────────────────────
const rel = path.relative(ROOT, out) || ".";
const lines: string[] = [];
lines.push(`\n볼트 동기화 → ${rel}/`);
lines.push(`  공개 노트 ${results.length}개, 이미지 ${images.size}개를 맞췄습니다. 비공개 노트 ${privateCount}개는 건너뛰었습니다.`);
if (removedPosts.length) lines.push(`  공개가 풀리거나 볼트에서 사라져 content/에서 지운 노트 ${removedPosts.length}개`);
lines.push(`  자체 검사: 노트 ${written.size}개 가운데 publish: true가 아닌 노트 ${after.notPublic}개, content/에 없는 노트를 가리키는 위키링크 ${after.dangling}개, 볼트 안을 가리키는 마크다운·HTML 주소 ${after.paths}개`);

const section = (title: string, items: string[]) => {
  if (!items.length) return;
  lines.push(`\n${title}`);
  for (const i of items) lines.push(`  ${i}`);
};
section(
  "[주의] slug 없이 한글 파일 이름을 주소로 쓰는 공개 노트",
  results.filter((r) => r.slugFromName && /[^\x00-\x7F]/.test(r.slug)).map((r) => `- ${r.name}.md → /blog/${r.slug}/`),
);
section(
  "[확인] 공개 노트가 아닌 노트를 가리켜 링크를 없애고 별칭만 남긴 곳",
  results.flatMap((r) => r.ctx.aliased.map((a) => `- ${r.where(a.at)} → "${a.text}"`)),
);
section("[주의] frontmatter가 규칙과 다른 공개 노트", results.filter((r) => r.issues.length).map((r) => `- ${r.name}.md: ${r.issues.join(", ")}`));
section("[알림] content/에 옮기지 않은 frontmatter 필드", results.filter((r) => r.dropped.length).map((r) => `- ${r.name}.md: ${r.dropped.join(", ")}`));
section("[주의] 볼트에서 찾지 못한 이미지", results.filter((r) => r.ctx.missing.length).map((r) => `- ${r.name}.md: ${r.ctx.missing.join(", ")}`));
section("[알림] 아직 다루지 않는 첨부 파일(이름만 글자로 남김)", results.filter((r) => r.ctx.unsupported.length).map((r) => `- ${r.name}.md: ${r.ctx.unsupported.join(", ")}`));
console.log(lines.join("\n") + "\n");
if (after.notPublic || after.dangling || after.paths) {
  console.error("자체 검사를 통과하지 못했습니다. content/를 커밋하지 말고 알려 주세요.\n");
  process.exit(1);
}
