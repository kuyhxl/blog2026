---
title: "MMU와 TLB: 주소 변환을 하드웨어가 돕는 방식"
date: 2026-09-19
type: cs
tags: [컴퓨터 구조, 메모리]
summary: 주소 변환을 맡는 MMU의 구조와, 최근 변환 결과를 기억해 두는 TLB가 동작하는 순서를 정리한다.
publish: true
id: ca-mmu-tlb
subject: ca
parent: ca-memory-hierarchy
---
CPU가 내놓는 주소는 모두 MMU를 거친다. MMU는 먼저 TLB에서 변환 결과를 찾는다.

## TLB 미스

TLB에 없으면 MMU가 테이블을 직접 따라 걷는다. 테이블의 구조는 [[페이징과 페이지 테이블]]에서 정리했다. 프로세스가 바뀔 때 무슨 일이 생기는지는 [[문맥 교환이 비싼 이유|문맥 교환]]에서 다룬다.
