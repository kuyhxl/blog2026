// 동기화가 비공개 노트를 흘리지 않는지 가짜 볼트로 확인한다. 실행: npm run test:privacy
// - content/와 동기화 출력에 비공개 노트의 내용·파일 이름·폴더 이름·주석이 없다
// - 공개 노트가 아닌 노트를 가리키는 링크는 별칭만 남고, 별칭이 없거나 끼워 넣기면 "경로:줄"만 알리고 멈춘다
// - 코드 블록 안의 [[…]]와 %%…%%는 그대로 남는다
// - 빌드는 content/에 없는 노트를 가리키는 위키링크를 만나면 이름을 내보내지 않고 멈춘다
// - iCloud에서 내려받지 않은 노트나 그림이 있으면 아무것도 쓰지 않고 멈춘다
// - 볼트 안에는 쓰지 않는다
// - 그림은 링크에 적힌 경로로 찾고, 같은 이름의 파일이 여럿이라 정할 수 없으면 멈춘다
// - 설명이 붙은 링크, 꺾쇠 링크, 참조형 링크와 그 정의, / 로 시작하는 경로도 같은 규칙을 따르고, HTML 속 볼트 주소는 멈춘다
// - 주소의 꾸밈(쿼리, 문자 참조, 탭, 역슬래시, obsidian://, file://, //, style의 url())에 속지 않는다
// - 같은 그림을 대소문자만 다르게 적어도 본문과 content/assets의 이름이 하나로 맞는다
// - 빌드는 본문의 링크·그림 주소가 사이트에 없는 곳을 가리키면 줄만 알리며 멈춘다
// - 코드 블록·주석으로 시작하는 글이나 문단도 그 뒤의 링크와 그림을 빠짐없이 다룬다
// - 달력에 없는 날짜(2026-13-40)는 동기화가 알리고 빌드가 멈춘다
// - 한글 파일 이름이 자모를 나눈 모양(NFD)이고 링크가 합친 모양(NFC)이어도(또는 그 반대여도) 같은 이름으로 본다
// - 본문이 있는 CS가 아닌 공개 글에 slug가 없으면 내보내지 않고 멈추며, 공개 글의 경로만 알린다
// - slug끼리(대소문자만 달라도), 또는 CS가 아닌 글의 slug와 지도의 개념 id가 겹치면 멈춘다
// - 빌드는 노트 속 위험한 HTML을 지우고, content/에 publish: true가 아닌 노트가 있으면 개수만 알리며 멈춘다
// - 링크 그래프는 인라인 코드 안의 [[…]]를 링크로 세지 않고, 노트가 바뀌면 다시 만든다
// out/이 있으면(npm run build:fixture 뒤) 빌드 결과물에도 비공개 표식이 없는지 본다
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE = path.join(ROOT, "scripts/fixtures/vault");
const SYNC = path.join(ROOT, "scripts/sync.ts");

// 공개 결과 어디에도 나오면 안 되는 말: 비공개 노트의 이름·내용·별명·폴더, 볼트에 없는 노트 이름
const SECRETS = ["SECRET-", "PRIVATE ", "면접 준비", "회사 메모", "깊은 노트", "private-only", "개인/", "깊은 폴더", "attachments/"];

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
  if (!ok) failed++;
};

const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `blog-${name}-`));
const sync = (vault: string, out: string) => spawnSync(process.execPath, [SYNC, "--vault", vault, "--out", out], { encoding: "utf8" });
const readAll = (dir: string): string =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.join(e.parentPath, e.name) + "\n" + fs.readFileSync(path.join(e.parentPath, e.name), "latin1") + fs.readFileSync(path.join(e.parentPath, e.name), "utf8"))
        .join("\n")
    : "";
const hashDir = (dir: string) => crypto.createHash("sha256").update(readAll(dir)).digest("hex");

console.log("\n1. 가짜 볼트 동기화");
{
  const before = hashDir(FIXTURE);
  const out = tmp("out");
  const r = sync(FIXTURE, out);
  const stdout = r.stdout + r.stderr;
  const content = readAll(out);
  check(r.status === 0, "동기화가 끝난다");
  check(hashDir(FIXTURE) === before, "볼트의 파일은 그대로다");
  check(fs.readdirSync(path.join(out, "posts")).length === 6, "공개 노트 6개만 옮겼다");
  check(fs.readdirSync(path.join(out, "assets")).sort().join() === "frame.svg,paging-diagram.png", "공개 글이 쓰는 그림 2개만 옮겼다");
  for (const s of SECRETS) check(!content.includes(s), `content/에 "${s}"가 없다`);
  for (const s of SECRETS) check(!stdout.includes(s), `동기화 출력에 "${s}"가 없다`);
  const paging = fs.readFileSync(path.join(out, "posts/페이징과 페이지 테이블.md"), "utf8");
  check(paging.includes("[[링크 아님]]") && paging.includes("%% 주석 아님 %%"), "코드 블록 안의 [[…]]와 %%…%%는 그대로다");
  check(paging.includes("%% mermaid 주석은"), "Mermaid 코드 안의 %% 주석은 그대로다");
  check(["면접 정리", "사내 정리", "아직 쓰지 않은 글", "지난 회고"].every((t) => paging.includes(t)), "공개 노트가 아닌 노트를 가리키는 링크는 별칭만 남았다");
  check(!paging.includes("aliases"), "정의되지 않은 frontmatter 필드는 빠졌다");
  check(stdout.includes('페이징과 페이지 테이블.md:26 → "면접 정리"'), "별칭만 남긴 곳을 원문의 경로:줄로 알린다");
  check(stdout.includes("publish: true가 아닌 노트 0개") && stdout.includes("위키링크 0개"), "자체 검사 결과를 개수로 알린다");
  check(!stdout.includes("slug가 없는 글"), "slug가 있는 글과 CS 노트(id)는 멈추지 않는다");
  check(stdout.includes("비공개 노트 3개는 건너뛰었습니다"), "비공개 노트는 개수만 센다");
}

console.log("\n2. 별칭 없는 링크와 끼워 넣기는 경로:줄만 알리고 멈춘다");
{
  const vault = tmp("vault");
  fs.cpSync(FIXTURE, vault, { recursive: true });
  const rel = "CS/운영체제/페이징과 페이지 테이블.md";
  const file = path.join(vault, rel);
  const cases = [
    "비공개 노트, 별칭 없음 [[PRIVATE 면접 준비]]",
    "비공개 노트 끼워 넣기, 별칭 있어도 ![[PRIVATE 회사 메모|별칭]]",
    "비공개 노트의 aliases로 가리킴 [[SECRET-ALIAS-LINK]]",
    "마크다운 링크, 글자 없음 [](개인/PRIVATE%20면접%20준비.md)",
    "볼트에 없는 노트, 별칭 없음 [[SECRET-NOWHERE 없는 노트]]",
  ];
  const src = fs.readFileSync(file, "utf8").trimEnd();
  const first = src.split("\n").length + 2;
  fs.writeFileSync(file, src + "\n\n" + cases.join("\n\n") + "\n");
  const out = tmp("out");
  fs.writeFileSync(path.join(out, "keep.txt"), "x");
  const r = sync(vault, out);
  const said = r.stdout + r.stderr;
  check(r.status === 2, "동기화를 멈춘다");
  check(fs.readdirSync(out).join() === "keep.txt", "결과 폴더를 건드리지 않는다");
  cases.forEach((c, i) => check(said.includes(`${rel}:${first + i * 2}`), `${c.split(" [")[0].split(" ![")[0]}: ${first + i * 2}번째 줄을 알린다`));
  for (const s of SECRETS) check(!said.includes(s), `출력에 "${s}"가 없다`);
}

console.log("\n3. iCloud에서 내려받지 않은 노트가 있으면 멈춘다");
{
  const vault = tmp("vault");
  fs.cpSync(FIXTURE, vault, { recursive: true });
  fs.writeFileSync(path.join(vault, "개인", ".PRIVATE 아직 안 받은 노트.md.icloud"), "");
  const out = tmp("out");
  fs.writeFileSync(path.join(out, "keep.txt"), "x");
  const r = sync(vault, out);
  check(r.status === 2, "동기화를 멈춘다");
  check(fs.readdirSync(out).join() === "keep.txt", "결과 폴더를 건드리지 않는다");
  check(!(r.stdout + r.stderr).includes("아직 안 받은"), "내려받지 않은 노트의 이름은 출력하지 않는다");
  check((r.stdout + r.stderr).includes("1개"), "개수를 알린다");
}

console.log("\n4. 공개 글이 쓰는 그림을 내려받지 않았으면 멈춘다");
{
  const vault = tmp("vault");
  fs.cpSync(FIXTURE, vault, { recursive: true });
  fs.rmSync(path.join(vault, "attachments/paging-diagram.png"));
  fs.writeFileSync(path.join(vault, "attachments/.paging-diagram.png.icloud"), "");
  const out = tmp("out");
  const r = sync(vault, out);
  check(r.status === 2, "동기화를 멈춘다");
  check((r.stdout + r.stderr).includes("paging-diagram.png"), "그림 이름을 목록으로 알린다");
  check(!fs.existsSync(path.join(out, "posts")), "결과 폴더에 아무것도 쓰지 않는다");
}

console.log("\n5. 결과 폴더가 볼트 안이면 멈춘다");
{
  const vault = tmp("vault");
  fs.cpSync(FIXTURE, vault, { recursive: true });
  const before = hashDir(vault);
  const r = sync(vault, path.join(vault, "content"));
  check(r.status === 2 && hashDir(vault) === before && !fs.existsSync(path.join(vault, "content")), "볼트에 아무것도 쓰지 않는다");
}

console.log("\n6. 빌드는 content/에 없는 노트를 가리키는 위키링크를 만나면 멈춘다");
{
  const dir = tmp("content");
  fs.mkdirSync(path.join(dir, "posts"));
  fs.writeFileSync(path.join(dir, "posts/글.md"), "---\ntitle: 글\ndate: 2026-10-04\ntype: til\npublish: true\nslug: post\n---\n첫 줄\n\n여기에 [[SECRET-DANGLING 노트]]가 있다.\n");
  process.env.CONTENT_DIR = dir;
  const { allNotes } = await import("../lib/content/posts.ts");
  const { renderPost } = await import("../lib/content/markdown.ts");
  let error = "";
  try {
    await renderPost(allNotes()[0]);
  } catch (e) {
    error = String(e);
  }
  check(error.includes("content/posts/글.md 본문 3번째 줄"), "파일과 줄을 알리며 멈춘다");
  check(!error.includes("SECRET-DANGLING"), "가리킨 노트 이름은 알리지 않는다");
}

const PAGING = "CS/운영체제/페이징과 페이지 테이블.md";
// 가짜 볼트를 복사해 페이징 노트 끝에 줄을 붙이고, 덧붙인 파일과 함께 동기화한다
function syncWith(lines: string[], files: Record<string, string> = {}) {
  const vault = tmp("vault");
  fs.cpSync(FIXTURE, vault, { recursive: true });
  for (const [f, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(vault, f)), { recursive: true });
    fs.writeFileSync(path.join(vault, f), data);
  }
  const file = path.join(vault, PAGING);
  const src = fs.readFileSync(file, "utf8").trimEnd();
  const first = src.split("\n").length + 2;
  fs.writeFileSync(file, src + "\n\n" + lines.join("\n\n") + "\n");
  const out = tmp("out");
  const r = sync(vault, out);
  const post = path.join(out, "posts/페이징과 페이지 테이블.md");
  return { r, said: r.stdout + r.stderr, out, post: fs.existsSync(post) ? fs.readFileSync(post, "utf8") : "", line: (i: number) => `${PAGING}:${first + i * 2}` };
}

console.log("\n8. 그림은 링크에 적힌 경로로 찾고, 정할 수 없으면 멈춘다");
{
  const files = { "a-공개/diagram.svg": "<svg>PUBLIC-IMAGE</svg>", "SECRET-폴더/diagram.svg": "<svg>SECRET-IMAGE</svg>", "b-공개/diagram.svg": "<svg>OTHER-IMAGE</svg>" };
  const asset = (out: string) => (fs.existsSync(path.join(out, "assets/diagram.svg")) ? fs.readFileSync(path.join(out, "assets/diagram.svg"), "utf8") : "");
  const a = syncWith(["![[a-공개/diagram.svg]]"], files);
  check(a.r.status === 0 && asset(a.out) === "<svg>PUBLIC-IMAGE</svg>", "![[폴더/그림]]은 그 폴더의 그림을 옮긴다(같은 이름의 다른 그림이 아니다)");
  const b = syncWith(["![설명](a-공개/diagram.svg)"], files);
  check(b.r.status === 0 && asset(b.out) === "<svg>PUBLIC-IMAGE</svg>", "마크다운 그림도 적힌 경로의 그림을 옮긴다");
  const c = syncWith(["![[diagram.svg]]"], files);
  check(c.r.status === 2 && c.said.includes(c.line(0)), "파일 이름만 적었는데 같은 이름이 여럿이면 경로:줄을 알리고 멈춘다");
  const d = syncWith(["![[a-공개/diagram.svg]]", "![[b-공개/diagram.svg]]"], files);
  check(d.r.status === 2 && d.said.includes(d.line(1)), "다른 폴더의 같은 이름 그림을 함께 쓰면 멈춘다");
  for (const x of [a, b, c, d]) check(!readAll(x.out).includes("SECRET-") && !x.said.includes("SECRET-"), "결과와 출력에 다른 폴더의 그림이나 폴더 이름이 없다");
  // 대소문자만 다르게 적은 같은 그림: 볼트의 실제 파일 이름(frame.svg) 하나로 맞춘다. 대소문자를 가리는 호스팅에서도 깨지지 않는다
  const e = syncWith(["![[FRAME.svg]]", "![설명](attachments/Frame.SVG)"]);
  check(e.r.status === 0 && fs.readdirSync(path.join(e.out, "assets")).sort().join() === "frame.svg,paging-diagram.png", "content/assets에는 실제 파일 이름 하나만 놓인다");
  check(!/FRAME\.svg|Frame\.SVG/.test(e.post) && e.post.includes("![[frame.svg]]") && e.post.includes("![설명](frame.svg)"), "본문의 그림 이름도 실제 파일 이름으로 맞춘다");
}

console.log("\n9. 여러 링크 문법이 같은 규칙을 따른다");
{
  const ok = syncWith([
    '[설명 붙은 링크](개인/PRIVATE%20면접%20준비.md "SECRET-TITLE 설명")',
    "[꺾쇠 링크](<개인/PRIVATE 면접 준비.md>)",
    "[참조 링크][비밀]",
    '[비밀]: 개인/PRIVATE%20회사%20메모.md "SECRET-DEF"',
    "[안 쓰는 정의]: <개인/PRIVATE 회사 메모.md>",
    "[맨 위 경로](/개인/PRIVATE%20면접%20준비.md)",
    '[공개 글](CS/운영체제/문맥%20교환이%20비싼%20이유.md "설명")',
    "[사이트 주소](/blog/os-paging/) [바깥 주소](https://example.com/a.md)",
    "[쿼리 붙은 링크](/개인/PRIVATE%20면접%20준비.md?download=1)",
    "[Obsidian 주소](obsidian://open?vault=v&file=개인%2FPRIVATE%20면접%20준비)",
    "[파일 주소](file:///Users/me/개인/PRIVATE%20면접%20준비.md)",
    "[다른 사이트처럼 쓴 주소](//개인/PRIVATE%20면접%20준비.md)",
  ]);
  const secrets = [...SECRETS, "SECRET-TITLE", "SECRET-DEF"];
  check(ok.r.status === 0, "동기화가 끝난다");
  for (const sct of secrets) check(!ok.post.includes(sct) && !ok.said.includes(sct), `content/와 출력에 "${sct}"가 없다`);
  check(["설명 붙은 링크", "꺾쇠 링크", "참조 링크", "맨 위 경로", "쿼리 붙은 링크", "Obsidian 주소", "파일 주소", "다른 사이트처럼 쓴 주소"].every((t) => ok.post.includes(t)), "공개 노트가 아닌 노트를 가리키면 링크 글자만 남는다");
  check(!ok.post.includes("obsidian:") && !ok.post.includes("file:") && !ok.post.includes("/Users/"), "obsidian://·file:// 주소는 남지 않는다");
  check(ok.post.includes("[[문맥 교환이 비싼 이유|공개 글]]"), "공개 노트를 가리키면 위키링크로 바뀐다");
  check(ok.post.includes("[사이트 주소](/blog/os-paging/)") && ok.post.includes("(https://example.com/a.md)"), "사이트 안 주소와 바깥 주소는 그대로 둔다");
  check(ok.said.includes("볼트 안을 가리키는 마크다운·HTML 주소 0개"), "자체 검사가 남은 볼트 주소를 센다");

  const stop = syncWith([
    '[](<개인/PRIVATE 면접 준비.md> "SECRET-TITLE")',
    '<a href="개인/PRIVATE%20면접%20준비.md">HTML 링크</a>',
    '<img src="attachments/private-only.png">',
    "<div>\n[HTML 속 링크](개인/PRIVATE%20면접%20준비.md)\n</div>",
    "[][빈 참조]\n\n[빈 참조]: 개인/PRIVATE%20회사%20메모.md",
  ]);
  check(stop.r.status === 2 && !fs.existsSync(path.join(stop.out, "posts")), "멈추고 아무것도 쓰지 않는다");
  // 종류가 다른 문제도 한 번에 모두 알린다. HTML 덩어리 속 링크는 덩어리의 둘째 줄에 있고, 세 줄짜리 덩어리 뒤의 줄은 두 줄 밀린다
  const where = (i: number, extra = 0) => stop.line(i).replace(/:(\d+)$/, (_, n) => ":" + (Number(n) + extra));
  ([["글자 없는 링크", 0], ["HTML 링크", 1], ["HTML 그림", 2], ["HTML 덩어리 속 마크다운 링크", 3, 1], ["글자 없는 참조형 링크", 4, 2]] as [string, number, number?][]).forEach(([what, i, extra]) =>
    check(new RegExp(`- ${where(i, extra).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(stop.said), `${what}: 경로:줄을 알린다`),
  );
  for (const sct of [...SECRETS, "SECRET-TITLE"]) check(!stop.said.includes(sct), `출력에 "${sct}"가 없다`);

  // HTML 속 주소는 브라우저가 읽는 대로 풀어서 본다
  const tricky = [
    ['<a href="/개인/PRIVATE 면접 준비&#46;md">문자 참조</a>', "문자 참조(&#46;)"],
    ['<a href="/개인/PRIVATE 면접 준비.m&#9;d">탭</a>', "탭 문자 참조(&#9;)"],
    ['<a href="\\개인\\PRIVATE 면접 준비.md">역슬래시</a>', "역슬래시"],
    ["<a HREF='/개인/PRIVATE%20면접%20준비.md?download=1'>대문자</a>", "대문자 속성과 쿼리"],
    ["<a href=/개인/PRIVATE%20면접%20준비.md>글자로 남는 태그</a>", "HTML로 읽히지 않고 글자로 남는 태그"],
    ["\\[막은 링크](개인/PRIVATE%20면접%20준비.md)", "역슬래시로 막아 글자로 남는 링크"],
    ["<div style=\"background:url('/개인/PRIVATE 면접 준비.md')\">style</div>", "style 속성의 url()"],
  ];
  const html = syncWith(tricky.map(([line]) => line));
  check(html.r.status === 2 && !fs.existsSync(path.join(html.out, "posts")), "HTML 속 꾸민 주소도 멈추고 아무것도 쓰지 않는다");
  tricky.forEach(([, what], i) => check(new RegExp(`- ${html.line(i).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(html.said), `${what}: 경로:줄을 알린다`));
  for (const sct of SECRETS) check(!html.said.includes(sct), `출력에 "${sct}"가 없다`);
}

// 빌드 쪽 검사에 쓰는 content/ 폴더. CS가 아닌 글에 slug가 없으면 파일 이름을 slug로 넣는다(빌드는 slug 없는 글에서 멈추므로)
const withSlug = (name: string, src: string) => (/^slug:/m.test(src) || /^type: cs$/m.test(src) ? src : src.replace(/^---\n/, `---\nslug: ${name}\n`));
function contentWith(notes: Record<string, string>) {
  const dir = tmp("content");
  fs.mkdirSync(path.join(dir, "posts"));
  for (const [name, body] of Object.entries(notes)) fs.writeFileSync(path.join(dir, "posts", name + ".md"), withSlug(name, body));
  process.env.CONTENT_DIR = dir;
  return dir;
}
const note = (body: string, publish = true) => `---\ntitle: t\ndate: 2026-10-05\ntype: til\nsummary: s\npublish: ${publish}\n---\n첫 문단\n\n${body}\n`;

console.log("\n10. 빌드는 노트 속 위험한 HTML을 지운다");
{
  contentWith({
    a: note(
      [
        "<script>SECRET-SCRIPT()</script>",
        "<img src=x onerror=alert(1)>",
        "[링크](javascript:alert(1)) <a href=\" JaVaScRiPt:alert(1)\">b</a> <a href=\"data:text/html,x\">c</a>",
        "<iframe src=https://evil.example></iframe> <style>body{display:none}</style>",
        '<div onclick="alert(1)" style="position:fixed">div</div>',
        "<details><summary>열기</summary>안</details>",
        "<kbd>K</kbd> ==강조==",
        "> [!tip] 콜아웃\n> 내용",
        "각주[^1]\n\n[^1]: 각주 내용",
      ].join("\n\n"),
    ),
  });
  const { allNotes } = await import("../lib/content/posts.ts");
  const { renderPost } = await import("../lib/content/markdown.ts");
  const html = (await renderPost(allNotes()[0])).html;
  for (const bad of ["<script", "SECRET-SCRIPT", "onerror", "onclick", "javascript:", "JaVaScRiPt", "data:text", "<iframe", "<style", "display:none", "style="]) check(!html.includes(bad), `HTML에 "${bad}"가 없다`);
  check(["<details>", "<kbd>K</kbd>", "<mark>강조</mark>", 'class="callout"'].every((t) => html.includes(t)), "허용한 태그와 이 사이트의 콜아웃은 남는다");
  const ref = /href="#([^"]+)"[^>]*data-footnote-ref/.exec(html)?.[1];
  check(!!ref && html.includes(`id="${ref}"`) && !html.includes("user-content-user-content"), "각주 링크가 각주를 가리킨다");
}

console.log("\n11. 빌드는 content/에 publish: true가 아닌 노트가 있으면 멈춘다");
{
  contentWith({ 공개: note("공개 글"), "SECRET-비공개": note("SECRET-BODY", false) });
  const { allNotes } = await import("../lib/content/posts.ts");
  let error = "";
  try {
    allNotes();
  } catch (e) {
    error = String(e);
  }
  check(error.includes("publish: true가 아닌 노트가 1개"), "개수를 알리며 멈춘다");
  check(!error.includes("SECRET-"), "노트 이름은 알리지 않는다");
}

console.log("\n12. 링크 그래프");
{
  const dir = contentWith({ a: note("코드 `[[b]]` 안\n\n[[c]] 링크"), b: note("b"), c: note("c"), d: note("d") });
  const { linkGraph } = await import("../lib/content/graph.ts");
  const edges = () => {
    const g = linkGraph().graph;
    return g.edges.map(([x, y]) => g.nodes[x].slug + ">" + g.nodes[y].slug).join(",");
  };
  check(edges() === "a>c", "인라인 코드 안의 [[…]]는 링크로 세지 않는다");
  fs.writeFileSync(path.join(dir, "posts/a.md"), withSlug("a", note("코드 `[[b]]` 안\n\n[[d]] 링크")));
  check(edges() === "a>d", "본문 길이가 같아도 링크가 바뀌면 그래프를 다시 만든다");
}

console.log("\n13. 빌드는 사이트에 없는 곳을 가리키는 주소를 만나면 줄만 알리고 멈춘다");
{
  const dir = contentWith({ b: note("b") });
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets/diagram.svg"), "<svg/>");
  const { allNotes } = await import("../lib/content/posts.ts");
  const { renderPost } = await import("../lib/content/markdown.ts");
  const render = async (body: string) => {
    fs.writeFileSync(path.join(dir, "posts/a.md"), withSlug("a", note(body)));
    try {
      return { html: (await renderPost(allNotes().find((n) => n.name === "a")!)).html, error: "" };
    } catch (e) {
      return { html: "", error: String(e) };
    }
  };
  const fine = await render("[홈](/) [목록](/blog/?tag=x) [글](/blog/b/) [지도](/cs) [RSS](/rss.xml) [제목](#x) [바깥](https://example.com/x.md) ![그림](/assets/diagram.svg) ![없는 그림](missing.png) [[b]]");
  check(!fine.error && fine.html.includes('href="/blog/b/"'), "사이트에 있는 주소와 바깥 주소는 통과한다");
  for (const [body, what] of [
    ["[링크](/SECRET-PATH/노트.md?download=1)", "쿼리 붙은 주소"],
    ['<a href="/SECRET-PATH/노트&#46;md">링크</a>', "문자 참조로 쓴 주소"],
    ["[링크](/blog/../SECRET-PATH/노트.md)", ".. 로 돌아 나가는 주소"],
    ['<img src="SECRET-PATH/그림.png">', "폴더가 붙은 상대 주소"],
    ["![그림](/assets/DIAGRAM.svg)", "대소문자가 다른 그림 이름"],
  ]) {
    const r = await render(body);
    check(r.error.includes("content/posts/a.md 본문 3번째 줄") && !r.error.includes("SECRET-PATH") && !r.error.includes("DIAGRAM"), `${what}: 줄만 알리며 멈춘다`);
  }
}

console.log("\n14. 코드 블록·주석으로 시작하는 글도 링크와 그림을 빠짐없이 다룬다");
{
  const head = (body: string) => `---\ntitle: 첫머리\ndate: 2026-10-06\ntype: til\ntags: [x]\nsummary: s\npublish: true\nslug: head\n---\n${body}\n`;
  const tail = "[공개 글](CS/운영체제/문맥%20교환이%20비싼%20이유.md)\n\n![그림](첫머리.svg)\n\n[[개인/PRIVATE 회사 메모|사내 정리]]";
  for (const [what, body] of [
    ["코드 블록으로 시작하는 글", "```js\nconst x = 1;\n```\n\n" + tail],
    ["Obsidian 주석으로 시작하는 글", "%% SECRET-COMMENT %%\n\n" + tail],
    ["인라인 코드로 시작하는 문단", "`x` " + tail.replace(/\n\n/g, " ")],
    ["주석으로 시작하는 문단", "%% SECRET-COMMENT %% " + tail.replace(/\n\n/g, " ")],
  ]) {
    const x = syncWith([], { "글/첫머리.md": head(body), "글/첫머리.svg": "<svg/>" });
    const post = fs.existsSync(path.join(x.out, "posts/첫머리.md")) ? fs.readFileSync(path.join(x.out, "posts/첫머리.md"), "utf8") : "";
    const assets = fs.existsSync(path.join(x.out, "assets")) ? fs.readdirSync(path.join(x.out, "assets")) : [];
    check(
      x.r.status === 0 && post.includes("[[문맥 교환이 비싼 이유|공개 글]]") && post.includes("![그림](") && assets.includes("첫머리.svg") && post.includes("사내 정리") && !post.includes("SECRET-") && !post.includes("PRIVATE"),
      `${what}: 링크는 바뀌고 그림은 옮겨지며 주석은 지워진다`,
    );
  }
}

console.log("\n15. 달력에 없는 날짜");
{
  const bad = (date: string) => `---\ntitle: t\ndate: ${date}\ntype: til\ntags: [x]\nsummary: s\npublish: true\nslug: bad-date\n---\n본문\n`;
  const x = syncWith([], { "글/날짜.md": bad("2026-13-40") });
  check(x.r.status === 0 && x.said.includes("날짜.md: date가 없거나, YYYY-MM-DD 형식의 달력에 있는 날짜가 아니다"), "동기화가 frontmatter 차이로 알린다");
  const { isDate } = await import("../lib/content/schema.ts");
  check(["2026-10-06", "2024-02-29"].every(isDate) && !["2026-13-40", "2026-02-29", "2026-02-30", "2026-04-31", "2026-1-5", ""].some(isDate), "윤년과 달마다 다른 날 수까지 가린다");
  contentWith({ a: bad("2026-13-40").replace("slug: bad-date\n", "") });
  const { allNotes } = await import("../lib/content/posts.ts");
  let error = "";
  try {
    allNotes();
  } catch (e) {
    error = String(e);
  }
  check(error.includes("content/posts/a.md: date가 없거나"), "빌드는 파일을 알리며 멈춘다(RSS가 깨지지 않는다)");
}

console.log("\n16. 한글을 나눈 모양(NFD)과 합친 모양(NFC)을 같게 본다");
{
  const NFD = (x: string) => x.normalize("NFD"), isNFC = (x: string) => x === x.normalize("NFC");
  const pub = (slug: string) => `---\ntitle: t\ndate: 2026-10-06\ntype: til\ntags: [x]\nsummary: s\npublish: true\nslug: ${slug}\n---\n본문\n`;
  // 파일 이름은 나눈 모양, 링크는 합친 모양. 그리고 반대로, 합친 모양의 파일(트리.md)을 나눈 모양의 링크로
  const x = syncWith(["[[분해형 노트]] [[글/분해형 노트|폴더 경로]]", "![[분해형 그림.svg]]", "![설명](글/분해형%20그림.svg)", `[[${NFD("트리")}]]`], {
    [NFD("글/분해형 노트.md")]: pub("nfd-note"),
    [NFD("글/분해형 그림.svg")]: "<svg/>",
  });
  check(x.r.status === 0, "동기화가 끝난다(링크를 비공개 노트로 보지 않는다)");
  const posts = x.r.status === 0 ? fs.readdirSync(path.join(x.out, "posts")) : [];
  const assets = x.r.status === 0 ? fs.readdirSync(path.join(x.out, "assets")) : [];
  check(posts.includes("분해형 노트.md") && posts.every(isNFC) && assets.includes("분해형 그림.svg") && assets.every(isNFC), "노트와 그림을 옮기고, content/의 파일 이름은 합친 모양으로 쓴다");
  check(x.post.includes("[[분해형 노트]]") && x.post.includes("[[분해형 노트|폴더 경로]]") && x.post.includes("![[분해형 그림.svg]]") && x.post.includes("[[트리]]") && isNFC(x.post), "본문의 링크와 그림 이름도 합친 모양으로 맞춘다");

  // 빌드: content/의 파일 이름이 나눈 모양이어도 링크·그래프가 이어진다
  contentWith({ [NFD("분해형")]: pub("nfd").replace("slug: nfd\n", ""), a: pub("a").replace("본문", "[[분해형]] 링크") });
  const { allNotes } = await import("../lib/content/posts.ts");
  const { renderPost } = await import("../lib/content/markdown.ts");
  const { linkGraph } = await import("../lib/content/graph.ts");
  const html = (await renderPost(allNotes().find((n) => n.slug === "a")!)).html;
  const g = linkGraph().graph;
  check(html.includes(`href="/blog/${encodeURIComponent("분해형")}/"`) && g.edges.some(([p, q]) => g.nodes[p].slug === "a" && g.nodes[q].slug === "분해형"), "빌드의 링크와 그래프가 이어지고, 글 주소는 합친 모양이다");
}

console.log("\n17. 본문이 있는 CS가 아닌 공개 글은 slug가 없으면 멈춘다");
{
  const fm = (type: string, slug: string | null, body: string) =>
    `---\ntitle: t\ndate: 2026-10-06\ntype: ${type}\ntags: [x]\nsummary: s\npublish: true\n${slug == null ? "" : `slug: ${slug}\n`}---\n${body}\n`;
  const x = syncWith(["[[slug 없는 글|가리키는 링크]]"], {
    "글/slug 없는 글.md": fm("til", null, "SECRET-BODY 본문이 있다"),
    "글/빈 slug.md": fm("project", '""', "본문이 있다"),
    "글/본문 없는 글.md": fm("troubleshooting", null, ""),
  });
  const lines = x.said.split("\n").filter((l) => l.startsWith("  - "));
  check(x.r.status === 2 && !fs.existsSync(path.join(x.out, "posts")), "멈추고 아무것도 쓰지 않는다");
  check(lines.includes("  - 글/slug 없는 글.md") && lines.includes("  - 글/빈 slug.md"), "slug가 없거나 빈 글의 경로를 알린다");
  check(!x.said.includes("본문 없는 글"), "본문이 빈 글은 slug가 없어도 멈추지 않는다");
  check(!/slug 없는 글\.md:\d/.test(x.said) && !x.said.includes("SECRET-BODY"), "경로만 알리고 줄 번호나 본문은 알리지 않는다");
  for (const sct of SECRETS) check(!x.said.includes(sct), `출력에 "${sct}"가 없다`);
}

console.log("\n18. 빌드도 본문이 있는 CS가 아닌 글에 slug가 없으면 멈춘다");
{
  const dir = contentWith({ b: note("b") });
  const raw = (type: string, slug: string | null, body: string) =>
    `---\ntitle: t\ndate: 2026-10-06\ntype: ${type}\ntags: [x]\nsummary: s\npublish: true\n${slug == null ? "" : `slug: ${slug}\n`}---\n${body}\n`;
  fs.writeFileSync(path.join(dir, "posts/없음.md"), raw("til", null, "본문"));
  fs.writeFileSync(path.join(dir, "posts/빈 값.md"), raw("project", '""', "본문"));
  fs.writeFileSync(path.join(dir, "posts/본문 없음.md"), raw("troubleshooting", null, ""));
  fs.writeFileSync(path.join(dir, "posts/CS.md"), raw("cs", null, "본문").replace("tags: [x]\n", "tags: [x]\nid: os-paging\n"));
  const { allNotes } = await import("../lib/content/posts.ts");
  let error = "";
  try {
    allNotes();
  } catch (e) {
    error = String(e);
  }
  const listed = error.split("\n").filter((l) => l.startsWith("  - "));
  check(listed.includes("  - content/posts/없음.md") && listed.includes("  - content/posts/빈 값.md"), "slug가 없거나 빈 글의 경로를 알리며 멈춘다");
  check(listed.length === 2, "본문이 빈 글과 CS 노트(id)는 알리지 않는다");
  fs.rmSync(path.join(dir, "posts/없음.md"));
  fs.rmSync(path.join(dir, "posts/빈 값.md"));
  let ok = true;
  try {
    allNotes();
  } catch {
    ok = false;
  }
  check(ok, "고치면 빌드가 이어진다");
}

console.log("\n19. 글 주소가 겹치면 멈춘다");
{
  const fm = (slug: string) => `---\ntitle: t\ndate: 2026-10-06\ntype: til\ntags: [x]\nsummary: s\npublish: true\nslug: ${slug}\n---\n본문\n`;
  const x = syncWith([], {
    "글/첫째.md": fm("same-slug"),
    "글/둘째.md": fm("Same-Slug"),
    "글/개념 id.md": fm("OS-Process"),
    "글/공개 CS와 같음.md": fm("os-paging"),
  });
  const lines = x.said.split("\n").filter((l) => l.startsWith("  - "));
  check(x.r.status === 2 && !fs.existsSync(path.join(x.out, "posts")), "멈추고 아무것도 쓰지 않는다");
  check(lines.some((l) => /^ {2}- \/blog\/same-slug\/ ← 글\/(첫째|둘째)\.md, 글\/(첫째|둘째)\.md$/i.test(l)), "대소문자만 다른 slug끼리 겹친 것을 알린다");
  check(lines.some((l) => l.includes("/blog/os-paging/ ←") && l.includes("공개 CS와 같음.md") && l.includes("페이징과 페이지 테이블.md")), "공개된 CS 노트의 id와 겹친 것을 알린다");
  check(lines.includes('  - 글/개념 id.md → slug "OS-Process"') && lines.includes('  - 글/공개 CS와 같음.md → slug "os-paging"'), "아직 공개 전인 개념의 id와 겹친 것도 알린다(대소문자 구분 없이)");
  const ok = syncWith([]);
  check(ok.r.status === 0, "CS 노트의 주소가 자기 id인 것은 겹침이 아니다");
}

const outDir = path.join(ROOT, "out");
if (fs.existsSync(path.join(outDir, "blog/os-paging"))) {
  console.log("\n7. 빌드 결과물(out/)");
  const built = readAll(outDir);
  for (const s of SECRETS) check(!built.includes(s), `out/에 "${s}"가 없다`);
  const rss = fs.existsSync(path.join(outDir, "rss.xml")) ? fs.readFileSync(path.join(outDir, "rss.xml"), "utf8") : "";
  check((rss.match(/<item>/g) ?? []).length === 4, "RSS에는 본문이 있는 공개 글 가운데 TIL을 뺀 4개만 들어간다");
  check(!rss.includes("<category>TIL</category>") && !rss.includes("EXPLAIN"), "RSS에 TIL은 없다");
  check(!rss.includes("<title>트리</title>"), "RSS에 빈 CS 노드는 없다");
  check(!rss.includes("[[") && !rss.includes("<p>"), "RSS에는 본문이 들어가지 않는다");
  const idxFile = path.join(outDir, "search-index.json");
  const idx = fs.existsSync(idxFile) ? (JSON.parse(fs.readFileSync(idxFile, "utf8")) as { slug: string; text: string }[]) : [];
  check(idx.length === 5 && !idx.some((e) => e.slug === "ds-tree"), "검색 인덱스에는 본문이 있는 공개 글 5개만 들어간다(빈 CS 노드 제외)");
  check(idx.some((e) => e.text.includes("invlpg")), "검색 인덱스에 본문 글자가 들어간다");
}

console.log(failed ? `\n${failed}개 실패\n` : "\n모두 통과\n");
process.exit(failed ? 1 : 0);
