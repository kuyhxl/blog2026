// 검색 인덱스(/search-index.json). 빌드 때 정적 파일로 만들어지고, 검색 창을 처음 열 때 한 번 받는다
import { searchIndex } from "@/lib/content/search";

export const dynamic = "force-static";

export function GET() {
  return Response.json(searchIndex());
}
