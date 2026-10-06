# blog2026

Obsidian으로 쓴 글을 보여주는 개인 기술 블로그. 일반적인 블로그 구조에 CS 개념 지도 페이지 "Beauty of CS"가 하나 더 있다.

## 가장 중요한 규칙

1. **볼트는 읽기 전용이다.** Obsidian 볼트의 파일을 만들거나 고치거나 지우지 않는다.
2. **공개 노트만 저장소에 들어온다.** frontmatter에 `publish: true`가 있는 노트만 `content/`로 복사한다. 그 밖의 노트는 내용도 파일명도 저장소, 빌드 결과물, 로그에 남기지 않는다. 비공개 노트의 제목과 내용은 화면, 검색 인덱스, RSS, 링크 그래프 데이터, 빌드 결과물 어디에도 들어가지 않는다. 이 규칙에는 예외를 두지 않는다.
3. **디자인의 기준은 `design/handoff/`다.** 작업을 시작하기 전에 `design/handoff/README.md`를 읽는다. 이 문서와 디자인 소스가 다르면 디자인 소스를 따르고, 다른 점을 알려 준다.
4. **한 단계씩 진행한다.** 아래 "빌드 순서"의 한 단계를 끝내면 멈추고 확인을 받는다.
5. **모르는 것은 지어내지 않고 묻는다.** 아래 "아직 정해지지 않은 것"이 대표적이다.
6. **커밋과 푸시는 하지 않는다.** 변경 내용만 정리해서 알려 준다.

## 아직 정해지지 않은 것

필요해지는 시점에 물어본다.

- 볼트 경로 (`.env.local.example` 참고)

## 기술 방향

- Next.js(App Router) + TypeScript, 정적 사이트로 빌드. 서버와 데이터베이스 없음
- 아래는 기본 후보다. 더 나은 대안이 있으면 이유와 함께 제안한 뒤 진행한다
  - Beauty of CS 맵: 디자인 소스에 배치와 길 내기 규칙이 직접 구현돼 있다. 그 규칙을 옮기는 것을 우선하고, 라이브러리(React Flow 등)는 그 규칙을 지킬 수 있을 때만 쓴다
  - 브레인 맵: 디자인 소스의 움직임 규칙을 옮긴다
  - 검색: 빌드 때 만드는 정적 검색 인덱스. 본문까지 찾는다
  - 댓글: giscus. 아래 "댓글" 참고
- 글꼴: IBM Plex Sans KR, IBM Plex Mono(`app/layout.tsx`). 한글 글꼴은 미리 받지(preload) 않는다. 구간 파일이 굵기마다 70개쯤이라 모두 미리 받으면 첫 화면에서 2.5MB가 넘는다. 미리 받지 않으면 브라우저가 화면에 쓰인 글자와 굵기의 구간만 받는다(홈 약 230KB)
- RSS: 주소는 `/rss.xml`. 빌드 때 생성한다
  - 본문이 있는 공개 글만 넣는다. 빈 CS 노드와 TIL은 뺀다(TIL 피드가 필요해지면 따로 만든다)
  - 피드 안의 글 주소는 전체 주소로 쓴다. 사이트 주소는 `SITE_URL`이고, 값은 커밋되는 `.env.production`에 있다(아래 "주소")
  - `SITE_URL`이 없으면 빌드가 멈춘다. 환경 변수로 주면 그 값이 앞선다. 개발 서버는 `http://localhost:3000`으로 대신한다
  - 글마다 제목, 주소, 날짜, 요약, 종류와 태그만 넣는다. 본문은 넣지 않는다
  - 모든 페이지의 `<head>`에 피드 주소를 등록하고, 푸터에 RSS 링크를 둔다
- 댓글: giscus. 저장소는 `kuyhxl/blog-comments`(사이트 저장소와 분리한 공개 저장소, Discussions의 Announcement 형식 카테고리). 설정 값은 `lib/site.ts`
  - 글과 토론은 slug로 잇는다(mapping `specific`, term `blog/<slug>`). strict 옵션으로 이름이 비슷한 글끼리 토론이 섞이지 않게 한다
  - 사이트의 라이트·다크 전환을 따라간다
  - 빈 CS 노드에는 댓글 창을 만들지 않는다
  - 댓글 창을 띄울 수 있는 주소는 댓글 저장소의 `giscus.json`(`origins`)으로 사이트 주소만 허용한다

## 폴더

```
design/handoff/   디자인 소스 (참고용, 수정 금지). README.md부터 읽는다
data/             cs-map-graph.json (Beauty of CS의 개념과 선. 지도의 원본)
content/          볼트에서 복사해 온 공개 노트 (커밋 대상)
scripts/          볼트 동기화 등 스크립트
seed/             npm run new:cs가 만든 CS 노트 틀 (커밋하지 않음)
public/           apple-touch-icon.png (npm run icons가 만든다), _headers (응답 헤더. 아래 "배포")
.github/workflows/ check.yml (검사만 한다. 아래 "배포")
wrangler.jsonc    Cloudflare 배포 설정 (아래 "배포")
```

## 콘텐츠 파이프라인

- 원본은 저장소 밖의 Obsidian 볼트. 경로는 `.env.local`의 `VAULT_PATH`로 받는다
- `npm run sync`: 볼트에서 `publish: true` 노트와 그 노트가 쓰는 이미지만 `content/`로 복사. 로컬에서만 실행
- 배포 환경은 볼트에 접근할 수 없으므로, 빌드는 `content/`만 읽는다
- 변환해야 하는 Obsidian 문법: `[[위키링크]]`, `[[노트|표시 이름]]`, `![[이미지]]`, 콜아웃(`> [!note]`), 코드 블록, 표
- 공개 노트가 아닌 노트를 가리키는 링크는 동기화 때 이렇게 처리한다. 위키링크와 마크다운 링크(설명이 붙은 `[글자](노트.md "설명")`, 꺾쇠 `[글자](<노트.md>)`, 참조형 `[글자][이름]`, `/`로 시작하는 볼트 경로, `obsidian://`·`file://` 주소)에 똑같이 적용한다. 마크다운 링크는 정규식이 아니라 문법 트리로 읽고, 주소는 브라우저가 읽는 대로 다듬은 뒤(쿼리 `?…` 떼기, `%` 표기·문자 참조 풀기, 탭·줄바꿈 지우기, `\`를 `/`로) 판단한다
  - 별칭(`[[노트|표시 이름]]`)이나 링크 글자가 있으면 그 글자만 일반 텍스트로 남긴다. 실제 노트 이름은 어디에도 출력하지 않는다
  - 별칭이 없으면 그 글을 내보내지 않고 동기화를 멈춘다. 알릴 때는 노트 이름 대신 공개 글의 경로와 줄 번호만 출력한다
  - `![[노트]]` 같은 본문 끼워 넣기는 별칭이 있어도 같은 방식으로 멈춘다
  - 볼트에 없는 노트를 가리키는 링크도 똑같이 다룬다. Obsidian은 비공개 노트의 `aliases`로도 링크를 이어 주므로, 없는 이름이 비공개 노트의 다른 이름일 수 있다
  - 볼트 안을 가리키는 참조 정의(`[이름]: 노트.md`)는 쓰는 곳이 없어도 지운다. 화면에는 안 보여도 `content/`에 남기 때문이다
  - HTML 속 주소(`href`, `src`, `style`의 `url()` 등)가 볼트 안을 가리키면 멈춘다. HTML은 파서로 읽어 문자 참조(`&#46;`)까지 푼다. HTML은 바꾸지 않으므로 위키링크나 마크다운 문법으로 바꿔 쓴다
  - 링크로 읽히지 않고 글자로 화면에 그대로 남는 링크 모양(따옴표 없는 태그 `<a href=/경로>`, 역슬래시로 막은 `\[글자](경로)`, HTML 덩어리 속 `[글자](경로)`)도 볼트 안을 가리키면 멈춘다
  - 빌드도 `content/`에 없는 노트를 가리키는 위키링크를 만나면 그 이름을 내보내지 않고 멈춘다
- 그림 같은 첨부 파일은 링크에 적힌 경로로 찾는다(`./`·`../`는 노트의 폴더에서, 폴더가 적혀 있으면 볼트 맨 위나 노트의 폴더에서). 파일 이름만 적었는데 볼트에 같은 이름이 여럿이면 어느 파일인지 정할 수 없으므로 멈춘다. `content/assets`에는 파일 이름만으로 놓이므로, 다른 폴더의 같은 이름 그림(대소문자만 다른 것 포함)을 함께 써도 멈춘다. 본문과 `content/assets`의 그림 이름은 링크에 적힌 대로가 아니라 볼트의 실제 파일 이름으로 맞춘다(대소문자를 가리는 호스팅에서도 깨지지 않게)
- 노트·첨부 파일의 이름과 경로는 한글을 합친 모양(NFC)으로 맞춘 뒤 견준다. macOS의 파일 이름은 자모를 나눈 모양(NFD)일 수 있기 때문이다. `content/`의 파일 이름, 본문의 링크·그림 이름, 글 주소도 합친 모양으로 쓴다
- 멈출 이유가 여럿이면 종류별로 모아 한 번에 알린다. 알릴 때는 공개 글의 경로와 줄 번호만 쓴다
- 빌드는 동기화를 거치지 않고 들어온 노트도 막는다
  - `content/posts`에 `publish: true`가 아닌 노트가 있으면 개수만 알리고 멈춘다
  - 본문이 있는데 CS 노트가 아니면서 slug가 없는 글이 있으면 그 글의 경로(`content/posts/…`)를 알리고 멈춘다(동기화와 같은 확인)
  - 본문의 링크·그림 주소는 바깥 주소이거나 사이트에 실제로 있는 곳(홈, 글 목록, 글, 지도, RSS, `content/assets`의 그림)만 가리켜야 한다. 아니면 주소는 알리지 않고 줄만 알리며 멈춘다(`lib/content/site-urls.ts`)
  - 노트에 적힌 HTML은 정화한다(`lib/content/sanitize.ts`). 기준은 GitHub와 같은 허용 목록에 `mark`와 콜아웃을 더한 것이다. `<script>`, `<style>`, `<iframe>`, `on…` 속성, `style` 속성, `javascript:` 주소는 지운다
  - SVG 첨부 파일도 정화해서 내보낸다(`lib/content/svg.ts`). `/assets/…svg`를 주소창에서 바로 열면 사이트와 같은 출처에서 그 안의 스크립트가 돌기 때문이다. 도형·글자·그라디언트·필터·`<style>`만 남기고, `<script>`, `<foreignObject>`, 애니메이션, `on…` 속성, 같은 그림 밖을 가리키는 `href`는 지운다. `content/assets`의 원본은 그대로 둔다

## frontmatter 규칙

모든 공개 노트:

```yaml
title: 글 제목
date: 2026-10-04
type: cs            # cs | troubleshooting | til | project
tags: [database, index]
summary: 한두 문장 요약
publish: true
```

`type: cs`가 아닌 노트에 필수:

```yaml
slug: mysql-deadlock        # 글 주소 /blog/<slug>/
```

`type: cs`인 노트에 추가:

```yaml
id: ds-btree                # data/cs-map-graph.json의 id와 같게. CS 노트에서 지도가 읽는 것은 이것뿐이다
```

- CS 노트의 과목, 부모, 선수 지식, 연관 개념은 `data/cs-map-graph.json`이 원본이다. 노트에 `subject`, `parent`, `prerequisites`, `related`가 적혀 있어도 읽지 않고 경고하지도 않는다
- 본문이 빈 CS 노트(빈 노드)는 `date`와 `summary`를 비워도 된다
- `date`는 형식(YYYY-MM-DD)뿐 아니라 달력에 있는 날짜여야 한다(`2026-13-40`, `2026-02-30`은 안 된다). 동기화는 frontmatter 차이로 알리고, 빌드는 멈춘다

- 글 주소는 CS 노트면 `id`, 나머지는 `slug`다. CS가 아닌 글은 slug가 필수다. 본문이 있는 `publish: true` 글에 slug가 없으면(비어 있어도) 동기화가 그 글을 내보내지 않고 멈추며, 알릴 때는 공개 글의 경로만 출력한다. 본문이 빈 노트는 글 페이지가 없으므로 멈추지 않는다. 빌드도 같은 글을 만나면 경로를 알리며 멈춘다
- slug를 바꾸면(CS 노트는 `id`) 글 주소가 바뀌고 기존 댓글과 연결이 끊긴다. 댓글은 slug로 토론을 찾기 때문이다
- 본문이 비어 있는 CS 노트는 "빈 노드"다. 맵에는 흐리게 나오고, 글 목록과 검색에는 나오지 않는다
- 기존 볼트의 노트가 이 규칙과 다르면 노트를 고치라고 하지 말고, 차이를 알려 준 뒤 어떻게 맞출지 묻는다

## 주소

사이트 주소는 `https://pine.chanhyeokhwang.com`이다. 도메인의 맨 위에 놓이므로 하위 경로(basePath)는 없다. 값은 `.env.production`의 `SITE_URL`.

| 화면 | 주소 |
|---|---|
| 홈 | `/` |
| 글 목록 | `/blog/` (종류·태그 필터 `?type=`, `?tag=`. 정렬 `?sort=`, `?dir=`) |
| 글 본문 | `/blog/<slug>/`, CS 노트는 `/blog/<id>/` |
| Beauty of CS | `/cs/` (특정 개념을 고른 채 열기 `/cs/?node=<id>`) |
| RSS | `/rss.xml` |
| 그림 | `/assets/<파일 이름>` |

- 주소 끝은 `/`로 통일한다(`next.config.ts`의 `trailingSlash`). 페이지마다 `폴더/index.html`로 만들어지고, Cloudflare(`wrangler.jsonc`의 `html_handling`)는 `/` 없는 주소를 307로 `/` 있는 주소로 보내며 쿼리(`?type=` 등)도 그대로 넘긴다. 사이트 안의 링크는 처음부터 `/`를 붙여 쓴다(글 주소는 `postHref()`)
- **글 종류와 날짜는 주소에 넣지 않는다.** 종류를 바꾸거나 날짜를 고쳐도 주소와 댓글이 그대로이게 한다
- slug끼리, 그리고 CS가 아닌 글의 slug와 Beauty of CS 개념 id(`data/cs-map-graph.json`, 아직 공개 전인 개념 포함)는 겹치면 안 된다. 대소문자만 달라도 겹친 것으로 보고 동기화가 멈춘다

## 배포

Cloudflare Workers에 정적 파일로 올린다. 서버 코드 없이 `out/`만 올리는 설정이 `wrangler.jsonc`에 있다(OpenNext 어댑터나 서버용 설정은 쓰지 않는다). 저장소를 연결한 Workers Builds가 main에 커밋이 올라올 때마다 빌드하고 배포한다.

- Cloudflare 설정(Workers & Pages → `blog2026` → Settings → Build)
  - 빌드 명령 `npm run build:checked`, 배포 명령 `npx wrangler deploy`
  - 빌드 변수 `NODE_VERSION`은 `mise.toml`의 Node 판과 같게 둔다. Workers Builds는 `mise.toml`을 읽지 않으므로 Node 판을 바꿀 때 둘을 함께 고친다
  - Worker 이름은 `wrangler.jsonc`의 `name`(`blog2026`)과 같아야 한다
  - wrangler는 devDependencies에 판을 고정해 두고(`^` 없이), Workers Builds의 `npx wrangler deploy`도 그 판을 쓴다. 판을 올릴 때는 `npm install -D -E wrangler@<판>` 뒤 `npx wrangler deploy --dry-run`으로 확인한다
- `build:checked`: `npm run lint` → `npm run sync:fixture` → `npm run build:fixture` → `npm run test:privacy` → `npm run build`. 하나라도 실패하면 배포하지 않는다. 누출 검사의 빌드 결과물 검사는 가짜 볼트로 만든 `out/`이 있어야 돌고, 그 뒤 실제 빌드가 `out/`을 새로 만든다
- `wrangler.jsonc`: 올리는 폴더는 `./out`. 없는 주소는 `out/404.html`을 404로 보여 주고(`not_found_handling: "404-page"`), 주소 끝의 `/`는 `trailingSlash`와 맞춘다(`html_handling: "force-trailing-slash"`). 이 파일이 없으면 `wrangler deploy`가 서버형 Next.js로 짐작해 자동 설정(OpenNext 설치)을 하다 실패한다
- 도메인: Worker의 Settings → Domains & Routes → Custom Domain에 `pine.chanhyeokhwang.com`. DNS 레코드와 인증서는 Cloudflare가 만든다
- HTTP는 HTTPS로 보낸다. Cloudflare의 SSL/TLS → Edge Certificates → Always Use HTTPS(도메인 전체에 걸린다). 이 설정은 저장소 밖에 있다
- 비밀 값은 없다. 사이트 주소는 `.env.production`에 있다
- GitHub Actions(`.github/workflows/check.yml`)는 배포하지 않고, main 푸시와 PR마다 같은 `build:checked`를 돌린다
  - 권한은 저장소 읽기만 준다
  - 바깥 Action은 커밋 SHA로 고정한다. 판을 올릴 때는 태그가 가리키는 SHA를 확인해 바꾸고, 뒤의 판 주석도 고친다
  - Node 판은 `mise.toml`에서 읽는다. 의존성 캐시와 설치 스크립트는 쓰지 않는다
- 응답 헤더는 `public/_headers`에 둔다. 빌드가 `out/`에 복사하고 Cloudflare가 읽는다(파일 자체는 내보내지 않는다)
  - 모든 주소: HSTS(`max-age=31536000`, 이 호스트만), `nosniff`, 다른 사이트의 틀 안에 넣기 막기(`X-Frame-Options`, `frame-ancestors`), `Referrer-Policy`
  - `/_next/static/*`: 이름에 내용 해시가 붙은 JS·CSS·글꼴이라 `max-age=31536000, immutable`. HTML·RSS·검색 인덱스·첨부 그림은 기본값(매번 확인)
  - `/assets/*`: 첨부 그림을 주소창에서 바로 열 때 스크립트와 바깥 요청을 막는 CSP(`sandbox`). SVG 정화에 한 겹 더한 것이다
  - 사이트 전체 CSP는 아직 없다. Next.js의 인라인 스크립트, Mermaid, giscus를 확인하며 정해야 한다. 노트의 HTML과 SVG는 헤더에 기대지 않고 빌드가 정화한다(위 "콘텐츠 파이프라인")

## 화면

모든 화면은 데스크톱, 모바일, 라이트, 다크 시안이 있다. 화면을 만들 때 네 가지를 함께 구현한다.

- **홈**: 자기소개, 최신 글 5개(TIL은 빼고 고른다), Beauty of CS 입구
- **글 목록**: 날짜와 큰 제목, 오른쪽 끝의 작은 글 종류 라벨이 있는 행(모바일은 날짜 줄 끝). 펼치면 요약, 태그, Read 링크. /Filters 위의 글 종류 필터(/Type: 전체 / CS / 트러블슈팅 / TIL / 프로젝트, 태그 필터와 같은 체크박스와 글 수), 태그 필터, 정렬, 브레인 맵 창
- **글 종류**: `cs`·`troubleshooting`·`til`·`project`의 이름은 CS / 트러블슈팅 / TIL / 프로젝트다(시안의 "CS 개념"을 바꿨고, 프로젝트는 시안에 없던 종류다). 필터, 행 라벨, 태그 칩, 글 머리, RSS 분류가 같은 이름을 쓴다. 프로젝트는 TIL과 달리 홈의 최신 글과 RSS에도 들어간다
- **TIL**: 따로 메뉴를 두지 않고 글 목록에 합친다. 글 목록, 검색, 브레인 맵, 백링크, 이전·다음 글, 글 본문의 FIG. 01에는 다른 글과 똑같이 나온다. 홈의 최신 글과 RSS에는 넣지 않는다
- **글 본문**: 따라오는 목차, 현재 글과 연결된 글만 보여주는 FIG. 01 창. 본문 아래에 백링크, 이전·다음 글, 댓글
- **검색**: 별도 페이지가 아니라 모든 화면 위에 겹쳐 뜨는 창. Search 버튼 또는 ⌘K / Ctrl+K
- **Beauty of CS**: 아래 별도 설명

## 브레인 맵

- 모든 공개 노트의 링크 그래프. 점 하나가 글 하나, 선은 글 사이의 위키링크
- 백링크와 같은 링크 데이터를 쓴다 (빌드 때 한 번 만든다)
- 빈 CS 노드는 흐린 점으로 표시

## Beauty of CS

- CS 개념만 다루는, 직접 설계한 배치의 지도. 브레인 맵과는 별개
- 5개 과목 구역: 컴퓨터 구조와 자료구조가 위, 운영체제가 가운데, 네트워크와 데이터베이스가 아래
- 2단계 노드: 큰 노드를 누르면 세부 노드가 펼쳐진다
- 연결선 두 종류: 선수 지식은 실선 화살표, 연관 개념은 점선
- 글이 있는 노드는 진하게, 빈 노드는 흐리게
- 개념(과목, 부모, 세부 개념 순서, 상자 이름)과 연결선의 원본은 `data/cs-map-graph.json`이다. CS 노트에서는 `id`만 읽어 그 개념에 글을 잇는다: 글이 있는지, 요약 패널의 글 제목·요약·날짜. json에 없는 id의 노트는 지도에 나오지 않는다(동기화가 알린다)
- 공개된 CS 노트가 없을 때도 `data/cs-map-graph.json`만으로 지도가 그려진다 (전부 빈 노드)
- 노트 틀: `npm run new:cs <개념 id>`가 `seed/<과목 이름>/<개념 이름>.md`를 하나 만든다(`publish: false`, `date`·`summary` 비움). 볼트로 옮기는 일은 사람이 한다. 개념 이름에 파일 이름으로 쓸 수 없는 글자가 있으면 `-- --name`으로 파일 이름을 정한다(`npm run new:cs -- --check`로 목록을 본다)
- 새 개념이나 선을 넣는 방법
  - 세부 개념: json `nodes`에 `{ id, title, subject, parent }`를 넣는다. 펼친 묶음 안의 순서는 json 순서다. 이름이 상자에 한 줄로 들어가지 않으면 `lib/csmap/layout.ts`의 `TWO`에 id를 넣는다(목록에 없어도 15자를 넘으면 두 줄로 쓴다)
  - 큰 개념: json `nodes`에 `parent: null`로 넣고, `lib/csmap/layout.ts`의 `ZONES`에서 그 과목의 `cells`에 `[열, 행]` 칸을 정한다. 칸이 없으면 지도에 나오지 않는다. 같은 구역의 선수 관계가 이웃한 칸끼리 이어지도록 놓는다(필요하면 `cols`·`rows`를 늘린다)
  - 선: json `edges`에 `{ from, to, type: "prerequisite" | "related", scope, note }`를 넣는다. `note`는 요약 패널의 목록에 나온다. 같은 구역 안의 선수 관계는 이웃한 큰 개념끼리일 때만 시안처럼 곧게 그려지고, 그 밖의 선은 구역 밖 통로로 돌아간다

## 디자인 메모

- 레퍼런스는 stripe.dev/blog의 구조와 분위기. 그 사이트의 코드, 글꼴, 그림은 가져오지 않는다
- 바탕색 라이트 `#E3ECE4`, 다크 `#162119`. 글자와 선은 무채색
- 오른쪽 상단에 픽셀 아트 소나무, 화면 전체에 커서 효과
- 파비콘은 `FaviconV2`의 시안 A(투명 배경). `npm run icons`가 시안의 격자와 색에서 만든다: `app/favicon.ico`(16·32칸), `app/apple-icon.png`와 `public/apple-touch-icon.png`(180×180, 빈 칸까지 바탕색). `<head>` 등록은 Next의 파일 규칙이 한다. `icon.svg`는 두지 않는다(브라우저가 SVG를 먼저 골라 2배 화면에서도 32칸이 안 보이므로). 그림은 손으로 고치지 않고 시안을 바꾼 뒤 다시 만든다
- 운영체제의 "동작 줄이기" 설정이 켜져 있으면 커서 효과와 움직임을 끈다
- 세부 값과 동작은 `design/handoff/README.md`와 각 화면 소스의 주석에 있다

## 빌드 순서

1. Next.js 프로젝트 생성, 디자인 토큰과 글꼴, 공통 헤더와 푸터, 테마 전환
2. 볼트 동기화 스크립트와 글 본문 화면 (Obsidian 문법 변환, 목차)
3. 글 목록 화면 (행 펼침, 태그 필터, 정렬)과 홈, RSS 피드 (`/rss.xml` 생성, `<head>`에 피드 주소 등록)
4. 링크 그래프 생성, 백링크, 브레인 맵과 FIG. 01 창, 이전·다음 글
5. 검색 창과 댓글
6. Beauty of CS 화면과 홈의 지도 미리 보기
7. 커서 효과, 소나무, 전체 화면의 모바일·다크 점검

각 단계를 시작할 때 계획을 먼저 보여 주고, 끝나면 실행 방법과 확인할 화면을 알려 준 뒤 멈춘다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
