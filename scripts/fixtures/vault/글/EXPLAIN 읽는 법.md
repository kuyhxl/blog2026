---
title: EXPLAIN의 type 컬럼 읽는 법
date: 2026-10-01
type: til
slug: explain-type
tags: [MySQL, 데이터베이스]
summary: ALL, index, range, ref, eq_ref, const가 각각 어떤 접근 방식인지와, 실행 계획에서 가장 먼저 볼 지점을 적어 둔다.
publish: true
---
실행 계획에서 가장 먼저 보는 칸은 `type`이다.

## type 컬럼

| type | 뜻 |
| --- | --- |
| ALL | 테이블 전체를 읽는다 |
| ref | 인덱스로 같은 값을 찾는다 |
| const | 기본 키로 한 행만 찾는다 |

## 그다음

`rows`와 `Extra`를 본다.
