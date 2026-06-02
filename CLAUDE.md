@AGENTS.md

# Running Crew App — 프로젝트 맥락 (다음 세션이 이어받기용)

러닝크루를 위한 **크루 전용** 웹앱. 개인 앱(Strava·NRC)이 못 하는 "집단·크루" 경험에 초점.
**운영비 0원**이 절대조건 → 정적 export(`output: "export"`)로 무료 호스팅(Cloudflare Pages 등).

## 사용자 / 상황
- 사용자는 프론트엔드 개발자(직장에서 Next.js 사용). 이 앱은 **혼자** 만드는 사이드프로젝트.
- 크루 규모 50~70명, 정기런 보통 10~20명. 크루원 다수가 Strava 사용(가민은 Strava 연동됨, NRC는 공개 API 없음).
- 선호: 인라인 스타일보다 CSS 클래스 분리 선호(단, 데이터/브랜딩 기반 동적 값은 인라인 허용).

## 기능 로드맵
| 단계 | 기능 | 상태 | 백엔드 |
| --- | --- | --- | --- |
| 1 | 🎬 기록 인증 카드 (기록 이미지 업로드 → OCR → 애니메이션 영상·GIF) | ✅ 구현됨 | 없음 |
| 2 | 🔧 정기런 페이스 그룹 자동 편성 (`/pace`) | 다음 차례 | 없음 (로직만) |
| 3 | 🗺️ 크루 집단 여정 지도 (누적거리 시각화) | 예정 | Supabase 무료 |
| 4 | 📣 대회 공동참가 + 응원 보드 | 예정 | Supabase 무료 |

> 1·2단계는 순수 프론트(백엔드 0). 3·4단계는 공유 데이터가 필요 → **Supabase 무료티어** 도입 예정.
> ⚠️ **Strava API는 2026-06-01부터 유료화**(월정액)되어 운영비 0원 원칙과 충돌 → OAuth 연동 폐기.
> 데이터 수집 전략: **기록 이미지 업로드 + OCR 자동인식 + 수동수정**(모두 클라이언트). NRC·Strava 둘 다 캡처/내보내기 이미지로 커버.

## 기술 스택
- Next.js 16 App Router · TypeScript · Tailwind CSS v4
- OCR: `tesseract.js`(WASM, 코어/언어데이터는 CDN 로드) — 이미지에서 거리·페이스·시간 추출
- 렌더/내보내기: HTML Canvas + `MediaRecorder`(영상 MP4/WebM) + `gifenc`(GIF). 전부 브라우저 처리, 서버비용 0.
- 정적 export(순수 정적, 워커 없음). `npm run build` → `out/` 폴더 그대로 무료 호스팅 업로드.
- 배포: GitHub `JANGHYUNn/running-crew` → Cloudflare(Workers Static Assets, 무료). `main` push 시 자동 빌드/배포. Node 버전은 `.node-version`(22).

## 구조 / 핵심 파일
- `lib/crew.ts` — ⭐ 크루 이름·색·로고 단일 설정. 브랜딩 바꾸려면 여기만.
- `lib/features.ts` — 기능 목록 + 출시 상태(ready/soon). 홈 런처가 이걸로 렌더.
- `lib/format.ts` — 페이스·시간·날짜 계산 헬퍼.
- `lib/ocr.ts` — 이미지 → 거리·페이스·시간 자동 인식(best-effort, 결과는 폼에서 수정 가능).
- `lib/cardRender.ts` — ⭐ 캔버스 프레임 렌더러 `drawFrame`. 미리보기·영상·GIF가 공유(해상도만 다름). **애니메이션 디자인 수정은 여기**.
- `lib/exporters.ts` — 영상(MediaRecorder)·GIF(gifenc) 내보내기.
- `app/page.tsx` — 홈(기능 런처). `app/card/page.tsx` — 1단계 생성기(업로드→인식→미리보기→내보내기).

## 다음 할 일 (이어서 작업 시)
1. `lib/crew.ts`에 실제 크루 이름/색 반영. 애니메이션 톤/레이아웃은 `lib/cardRender.ts`에서 조정(현재 v1: 이미지 줌+숫자 카운트업+크루 푸터).
2. OCR 정확도 개선: 실제 Strava/NRC 캡처로 `lib/ocr.ts`의 `parseStats` 정규식 보강.
3. **2단계 페이스 그룹 편성** 구현: 참가자 목표페이스 입력 → A/B/C조 자동 분반 → 편성표. 백엔드 0, localStorage 정도.
4. 이후 3·4단계에서 Supabase 무료티어 도입.
