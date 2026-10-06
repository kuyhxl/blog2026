// 개념 id를 받아 그 개념의 CS 노트 틀 하나를 seed/<과목 이름>/<개념 이름>.md로 만든다.
// 볼트에는 쓰지 않는다. 볼트로 옮기는 일은 사람이 한다.
//
// 실행: npm run new:cs <개념 id>                 예: npm run new:cs os-paging
//       npm run new:cs <개념 id> -- --name <파일 이름>   개념 이름을 파일 이름으로 쓸 수 없을 때
//       npm run new:cs -- --check                 파일 이름으로 쓸 수 없는 개념 이름 목록
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
type Graph = { subjects: Record<string, string>; nodes: { id: string; title: string; subject: string; parent: string | null }[] };
const graph = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cs-map-graph.json"), "utf8")) as Graph;

// 파일 이름에 쓸 수 없는 글자(macOS·Windows·Obsidian)와 위키링크에서 뜻이 있는 글자
const BAD = /[\\/:*?"<>|#^[\]]/g;
const problems = (name: string) => [...new Set(name.match(BAD) ?? [])].concat(name.startsWith(".") ? ["맨 앞의 ."] : []);

function stop(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.includes("--check")) {
  const bad = graph.nodes.filter((n) => problems(n.title).length);
  console.log(bad.length ? `\n파일 이름으로 쓸 수 없는 개념 이름 ${bad.length}개 (--name으로 파일 이름을 정해 주세요)` : "\n파일 이름으로 쓸 수 없는 개념 이름은 없습니다.");
  for (const n of bad) console.log(`  - ${n.id}: ${n.title}  (${problems(n.title).join(" ")})`);
  console.log("");
  process.exit(0);
}

const id = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--name");
if (!id) stop("개념 id를 주세요. 예: npm run new:cs os-paging");
const node = graph.nodes.find((n) => n.id === id);
if (!node) stop(`"${id}"는 data/cs-map-graph.json에 없는 id입니다.`);

const nameArg = args.includes("--name") ? args[args.indexOf("--name") + 1] : undefined;
const name = (nameArg ?? node.title).trim();
const bad = problems(name);
if (bad.length) {
  stop(
    `"${name}"에는 파일 이름으로 쓸 수 없는 글자(${bad.join(" ")})가 있습니다.\n` +
      `파일 이름을 따로 정해 주세요. 노트 안의 title은 원래 이름 그대로 둡니다.\n` +
      `예: npm run new:cs ${id} -- --name "${name.replace(BAD, "-")}"`,
  );
}

const subject = graph.subjects[node.subject] ?? node.subject;
const file = path.join(ROOT, "seed", subject, `${name}.md`);
if (fs.existsSync(file)) stop(`이미 있습니다: ${path.relative(ROOT, file)}\n덮어쓰지 않았습니다.`);

// 틀: 공개할 때 date와 summary를 채우고 publish를 true로 바꾼다.
// 본문이 빈 채로 공개하면 지도에 흐린 빈 노드로 남는다(빈 CS 노트는 date와 summary를 비워도 된다)
const q = (s: string) => JSON.stringify(s);
const text = ["---", `title: ${q(node.title)}`, "type: cs", `tags: [${q(subject)}]`, `id: ${node.id}`, "publish: false", "date:", "summary:", "---", ""].join("\n");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, text);
console.log(`\n만들었습니다: ${path.relative(ROOT, file)}\n볼트로 옮긴 뒤, 공개할 때 date와 summary를 채우고 publish를 true로 바꿔 주세요.\n`);
