---
title: "도커 PostgreSQL에 접속이 안 될 때: 로컬 DB가 5432를 먼저 잡고 있었다"
date: 2026-08-04
type: troubleshooting
tags:
  - docker
  - postgresql
summary: 로컬에 설치된 PostgreSQL이 5432 포트를 먼저 쓰고 있어 도커 컨테이너의 DB에 접속하지 못했던 문제와, 호스트
  포트를 바꿔 해결한 과정.
publish: true
slug: docker-postgres-port-conflict
---
