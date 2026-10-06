// SVG 첨부 파일 정화. /assets/<이름>.svg를 주소창에서 바로 열면 SVG가 사이트와 같은 출처의 문서로 열려 그 안의 스크립트가 돈다
// (<img>로 보일 때는 돌지 않는다). 그래서 빌드가 내보내는 SVG에는 그림을 그리는 요소와 속성만 남긴다.
// - 남기는 것: 도형, 글자, 그라디언트·패턴·마스크·필터, <style>. 허용 목록에 없는 요소는 안의 것까지 지운다(SVG는 모르는 요소의 안을 그리지 않으므로 그림은 같다)
// - 지우는 것: <script>, <foreignObject>(HTML을 담는다), 애니메이션(<set>·<animate>로 주소를 바꿀 수 있다), on… 속성, 허용 목록에 없는 속성,
//   주석과 처리 명령(<?xml-stylesheet?>), DOCTYPE(엔티티)
// - <a>는 껍질만 벗기고 안의 그림을 남긴다
// - href는 같은 그림 안(#id)만 가리킬 수 있다. <image>·<feImage>는 data: 주소의 PNG·JPEG·GIF·WebP·AVIF·BMP도 된다
// 원본은 HTML 파서(parse5)로 읽는다. 브라우저처럼 고장 난 마크업도 끝까지 읽고, 엔티티를 정의하는 DOCTYPE은 무시한다. 결과는 XML로 다시 쓴다
import { html, parseFragment, type DefaultTreeAdapterTypes as T } from "parse5";

type Node = T.ChildNode;
type Element = T.Element;

const { SVG, XLINK, XML } = html.NS;

const ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "switch", "title", "desc", "style",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "linearGradient", "radialGradient", "stop", "pattern", "clipPath", "mask", "marker", "image",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting",
  "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
  "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
  "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
]);

// 위치·모양·칠하기 속성. 이름은 SVG에 적는 그대로(대소문자 포함)
const ATTRS = new Set([
  "id", "class", "style", "lang", "transform", "viewBox", "preserveAspectRatio", "version",
  "x", "y", "width", "height", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "fr", "d", "points", "pathLength",
  "dx", "dy", "rotate", "textLength", "lengthAdjust", "startOffset", "method", "spacing", "side",
  "offset", "gradientUnits", "gradientTransform", "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform",
  "clipPathUnits", "maskUnits", "maskContentUnits", "markerUnits", "markerWidth", "markerHeight", "refX", "refY", "orient",
  "filterUnits", "primitiveUnits", "result", "in", "in2", "mode", "operator", "k1", "k2", "k3", "k4", "type", "values", "tableValues",
  "slope", "intercept", "amplitude", "exponent", "stdDeviation", "edgeMode", "kernelMatrix", "order", "divisor", "bias",
  "targetX", "targetY", "preserveAlpha", "surfaceScale", "diffuseConstant", "specularConstant", "specularExponent",
  "kernelUnitLength", "scale", "xChannelSelector", "yChannelSelector", "azimuth", "elevation", "z",
  "pointsAtX", "pointsAtY", "pointsAtZ", "limitingConeAngle", "radius", "baseFrequency", "numOctaves", "seed", "stitchTiles",
  "alignment-baseline", "baseline-shift", "clip", "clip-path", "clip-rule", "color", "color-interpolation",
  "color-interpolation-filters", "color-rendering", "direction", "display", "dominant-baseline", "fill", "fill-opacity",
  "fill-rule", "filter", "flood-color", "flood-opacity", "font", "font-family", "font-size", "font-size-adjust", "font-stretch",
  "font-style", "font-variant", "font-weight", "image-rendering", "letter-spacing", "lighting-color", "marker-start",
  "marker-mid", "marker-end", "mask", "opacity", "overflow", "paint-order", "pointer-events", "shape-rendering", "stop-color",
  "stop-opacity", "stroke", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-opacity", "stroke-width", "text-anchor", "text-decoration", "text-rendering", "transform-origin", "unicode-bidi",
  "vector-effect", "visibility", "word-spacing", "writing-mode",
]);

const RASTER = /^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]*$/i;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

const isElement = (n: Node): n is Element => "tagName" in n;

function attrs(el: Element) {
  const out: string[] = [];
  for (const a of el.attrs) {
    let name: string;
    if (!a.namespace) name = a.name;
    else if (a.namespace === XLINK && a.name === "href") name = "xlink:href";
    else if (a.namespace === XML && a.name === "space") name = "xml:space";
    else continue; // xmlns 선언은 맨 위 <svg>에 따로 쓴다. 그 밖의 이름 공간 속성은 지운다
    if (name === "href" || name === "xlink:href") {
      const v = a.value.trim();
      if (!(v.startsWith("#") || ((el.tagName === "image" || el.tagName === "feImage") && RASTER.test(v)))) continue;
      out.push(`${name}="${escAttr(v)}"`);
    } else if (name === "xml:space" || ATTRS.has(name)) out.push(`${name}="${escAttr(a.value)}"`);
  }
  return out;
}

function write(n: Node, inStyle: boolean): string {
  if (n.nodeName === "#text") return esc((n as T.TextNode).value);
  if (!isElement(n) || inStyle) return ""; // 주석, <style> 안의 요소
  if (n.namespaceURI !== SVG) return "";
  if (n.tagName === "a") return n.childNodes.map((c) => write(c, false)).join("");
  if (!ELEMENTS.has(n.tagName)) return "";
  const inner = n.childNodes.map((c) => write(c, n.tagName === "style")).join("");
  return `<${[n.tagName, ...attrs(n)].join(" ")}>${inner}</${n.tagName}>`;
}

// 맨 위 <svg>를 찾아 정화한 SVG 문서를 돌려준다. <svg>가 없으면 null
export function cleanSvg(src: string): string | null {
  const find = (nodes: Node[]): Element | null => {
    for (const n of nodes) {
      if (!isElement(n)) continue;
      if (n.tagName === "svg" && n.namespaceURI === SVG) return n;
      const deeper = find(n.childNodes);
      if (deeper) return deeper;
    }
    return null;
  };
  const root = find(parseFragment(src).childNodes);
  if (!root) return null;
  const inner = root.childNodes.map((c) => write(c, false)).join("");
  const head = ["svg", `xmlns="${SVG}"`, `xmlns:xlink="${XLINK}"`, ...attrs(root)].join(" ");
  return `<${head}>${inner}</svg>\n`;
}
