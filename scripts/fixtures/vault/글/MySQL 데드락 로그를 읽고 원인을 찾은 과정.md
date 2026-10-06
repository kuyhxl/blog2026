---
title: MySQL 데드락 로그를 읽고 원인을 찾은 과정
date: 2026-09-22
type: troubleshooting
tags: [MySQL, 동시성]
summary: SHOW ENGINE INNODB STATUS의 데드락 구간을 읽는 순서와, 락을 잡는 순서를 맞춰 해결한 과정.
publish: true
slug: mysql-deadlock
---
주문 두 건이 서로의 행 락을 기다리며 멈췄다. 주소 변환과는 상관없지만 [[페이징과 페이지 테이블|페이징 글]]처럼 자원을 잡는 순서가 핵심이다.

## 로그 읽기

```sql
SHOW ENGINE INNODB STATUS;
-- LATEST DETECTED DEADLOCK 구간을 본다
SELECT * FROM orders WHERE id = 1 FOR UPDATE;
```

## 해결

락을 잡는 순서를 id 오름차순으로 맞췄다.
