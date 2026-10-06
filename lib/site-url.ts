// 사이트 주소(SITE_URL). RSS 안의 글 주소와 <head>의 피드 주소를 전체 주소로 만들 때 쓴다.
// 값은 .env.production에 있다(https://pine.chanhyeokhwang.com). 빌드가 읽고, 환경 변수로 주면 그 값이 앞선다.
// 개발 서버는 .env.production을 읽지 않으므로 http://localhost:3000으로 대신한다. 빌드에서 값이 없으면 멈춘다
export function siteUrl(): string {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
    throw new Error("SITE_URL이 없습니다. .env.production에 SITE_URL=https://pine.chanhyeokhwang.com 이 있는지 확인해 주세요.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_URL "${raw}"이 주소 형식이 아닙니다. 예: https://example.com`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`SITE_URL "${raw}"은 http:// 또는 https://로 시작해야 합니다.`);
  return (url.origin + url.pathname).replace(/\/+$/, "");
}
