// content/assets의 그림을 /assets/<이름>으로 내보낸다. 빌드 때 정적 파일로 만들어진다
import fs from "node:fs";
import path from "node:path";
import { contentDir } from "@/lib/content/posts";

export const dynamic = "force-static";
export const dynamicParams = false;

// 정적 내보내기는 만들 경로가 하나도 없으면 빌드를 멈춘다. 그림이 없을 때는 이 이름 하나를 만들고 404로 답한다
const EMPTY = "_none";

const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp",
};

const list = () => {
  const dir = path.join(contentDir(), "assets");
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

export function generateStaticParams() {
  const names = list();
  return names.length ? names.map((name) => ({ name })) : [{ name: EMPTY }];
}

export async function GET(_req: Request, ctx: RouteContext<"/assets/[name]">) {
  const raw = (await ctx.params).name;
  // 이름은 그대로 오기도 하고(100%.svg) % 표기로 바뀌어 오기도 한다(한글 이름). 풀어서 맞추면 이름에 %가 든 파일에서 깨지므로,
  // 실제 파일 이름과 그 % 표기를 견주어 찾는다
  const names = list();
  const name = names.find((n) => n === raw) ?? names.find((n) => encodeURIComponent(n) === raw);
  if (!name) return new Response("Not found", { status: 404 });
  const file = path.join(contentDir(), "assets", name);
  const type = TYPES[path.extname(name).slice(1).toLowerCase()] ?? "application/octet-stream";
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": type } });
}
