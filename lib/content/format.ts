// 화면에 보이는 형식. 브라우저 쪽 컴포넌트도 쓰므로 파일 시스템에 손대지 않는다

// 글 종류의 이름. 필터, 글 행의 라벨, 태그 칩, 글 머리, RSS 분류가 모두 이 이름을 쓰고, 필터는 이 순서로 놓는다.
// 시안의 "CS 개념"은 "CS"로 바꿨고, 프로젝트는 시안에 없던 종류다(볼트에 type: project 노트가 있다)
export const TYPE_LABEL: Record<string, string> = { cs: "CS", troubleshooting: "트러블슈팅", til: "TIL", project: "프로젝트" };

// 글 주소. 사이트 안의 주소는 끝을 /로 통일한다(CLAUDE.md "주소")
export const postHref = (slug: string) => `/blog/${encodeURIComponent(slug)}/`;

// 2026-10-04 → 2026.10.04
export const formatDate = (d: string) => d.replaceAll("-", ".");

// 글 행과 태그 칩에 쓰는 말: 종류 라벨 다음에 태그
export const chipsOf = (p: { type: string; tags: string[] }) => [TYPE_LABEL[p.type], ...p.tags].filter(Boolean);
