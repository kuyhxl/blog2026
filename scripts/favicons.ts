// 파비콘을 디자인 소스의 격자에서 만든다. 실행: npm run icons
// 원본은 design/handoff/screens/FaviconV2.dc.html(README "파비콘")의 격자 G16·G32·G180, 글자→색 표 FULL, 색 .day.
// 쓰는 시안은 A(투명 배경)다.
// - app/favicon.ico: 16칸과 32칸 두 장(투명). 브라우저가 화면 밀도에 맞는 쪽을 고른다(2배 화면은 32칸)
//   icon.svg는 두지 않는다. SVG는 한 그림이 모든 밀도에 쓰여서, 브라우저가 SVG를 먼저 고르면 2배 화면에서도 32칸이 보이지 않는다
// - app/apple-icon.png, public/apple-touch-icon.png: 180×180(30칸, 한 칸 6px).
//   홈 화면 아이콘은 투명할 수 없어 빈 칸까지 --bg로 채운다(README: A를 골라도 180은 B와 같은 그림)
// Next가 app/의 favicon·apple-icon을 <head>에 등록한다.
// public/apple-touch-icon.png는 <head>를 읽지 않고 이 주소를 바로 찾는 곳을 위한 같은 그림이다
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "design/handoff/screens/FaviconV2.dc.html");

function fail(msg: string): never {
  console.error(`\n파비콘을 만들지 못했습니다. ${msg}\n`);
  process.exit(2);
}

const src = fs.readFileSync(SRC, "utf8");

// 격자: 한 글자가 한 칸, 첫 줄 첫 글자가 왼쪽 위
function grid(name: string, n: number): string[] {
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(src);
  if (!m) fail(`${name} 격자를 찾지 못했습니다.`);
  const rows = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  if (rows.length !== n || rows.some((r) => r.length !== n || /[^.123ab]/.test(r))) fail(`${name}이 ${n}×${n}칸이 아니거나 모르는 글자가 있습니다.`);
  return rows;
}

// 글자 → 색 이름(p1 p2 p3 k1 k2)
function table(name: string): Record<string, string> {
  const m = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(src);
  if (!m) fail(`${name} 표를 찾지 못했습니다.`);
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*'(\w+)'/g)].map((x) => [x[1], x[2]]));
}

// 색 이름 → 색 값. 시안의 .day(라이트 토큰)
function tone(cls: string): Record<string, string> {
  const m = new RegExp(`\\.fv \\.${cls}\\{([^}]*)\\}`).exec(src);
  if (!m) fail(`.${cls} 색을 찾지 못했습니다.`);
  const v = Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2].toUpperCase()]));
  const out = { bg: v.bg, p1: v["pine-1"], p2: v["pine-2"], p3: v["pine-3"], k1: v["bark-1"], k2: v["bark-2"] };
  for (const [k, c] of Object.entries(out)) if (!c) fail(`.${cls}에 ${k} 색이 없습니다.`);
  return out;
}

const G16 = grid("G16", 16), G32 = grid("G32", 32), G180 = grid("G180", 30);
const FULL = table("FULL");
const DAY = tone("day");

// 칸의 색. 빈 칸은 fill(바탕) 또는 투명(null)
const cellColor = (ch: string, fill: string | null) => (ch === "." ? fill : DAY[FULL[ch]] ?? fail(`표에 없는 글자 "${ch}"`));

// ── PNG ─────────────────────────────────────────────────────────────────────
// 칸을 scale배로 키운 RGBA 그림. 흐림 없이 칸마다 같은 색으로 채운다
function raster(g: string[], scale: number, fill: string | null) {
  const w = g.length * scale;
  const rgba = Buffer.alloc(w * w * 4);
  g.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = cellColor(ch, fill);
      if (!c) return;
      const [r, gr, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const p = ((y * scale + dy) * w + x * scale + dx) * 4;
          rgba[p] = r;
          rgba[p + 1] = gr;
          rgba[p + 2] = b;
          rgba[p + 3] = 255;
        }
    }),
  );
  return { w, rgba };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png({ w, rgba }: { w: number; rgba: Buffer }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8; // 채널마다 8비트
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * w);
  for (let y = 0; y < w; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); // 줄마다 필터 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── ICO: PNG를 그대로 담는다(모든 요즘 브라우저가 읽는다) ─────────────────
function ico(images: { w: number; data: Buffer }[]) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2); // 아이콘
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ w, data }, i) => {
    const e = 6 + 16 * i;
    head[e] = w;
    head[e + 1] = w;
    head.writeUInt16LE(1, e + 4); // 면
    head.writeUInt16LE(32, e + 6); // 비트
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((x) => x.data)]);
}

// ── 쓰기 ────────────────────────────────────────────────────────────────────
const touch = png(raster(G180, 6, DAY.bg));
const files: [string, Buffer][] = [
  ["app/favicon.ico", ico([16, 32].map((w) => ({ w, data: png(raster(w === 16 ? G16 : G32, 1, null)) })))],
  ["app/apple-icon.png", touch],
  ["public/apple-touch-icon.png", touch],
];
for (const [f, data] of files) {
  fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, f), data);
}
console.log(`\n파비콘을 만들었습니다(시안 A, ${path.relative(ROOT, SRC)}):\n${files.map(([f, d]) => `  ${f}  ${d.length}바이트`).join("\n")}\n`);
