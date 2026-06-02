# 🏃 Running Crew App

러닝크루를 위한 **크루 전용** 웹앱. 개인 앱(Strava·NRC)이 못 하는 "집단·크루" 경험에 초점.
**운영비 0원** — 정적 사이트로 빌드해 Cloudflare Pages / Vercel / Netlify 무료티어에 배포.

## 기능 로드맵

| 단계 | 기능 | 상태 | 백엔드 |
| --- | --- | --- | --- |
| 1 | 📸 기록 인증 카드 (사진 위 기록 오버레이 → PNG) | ✅ 구현됨 | 없음 |
| 2 | 🔧 정기런 페이스 그룹 자동 편성 | 예정 | 없음 |
| 3 | 🗺️ 크루 집단 여정 지도 (누적거리 시각화) | 예정 | Supabase 무료 |
| 4 | 📣 대회 공동참가 + 응원 보드 | 예정 | Supabase 무료 |

> 1·2단계는 순수 프론트(백엔드 0), 3·4단계는 공유 데이터가 필요해 Supabase 무료티어 도입 예정.

## 기술 스택

- Next.js (App Router) · TypeScript · Tailwind CSS v4
- 카드 → PNG 캡처: `html-to-image` (브라우저에서 처리, 서버비용 0)
- 정적 export (`next.config.ts`의 `output: "export"`)

## 시작하기

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 정적 사이트가 out/ 에 생성됨
```

`out/` 폴더를 Cloudflare Pages 등에 그대로 올리면 배포 끝.

## 크루 브랜딩 바꾸기

`lib/crew.ts` 한 파일만 수정하면 앱 전체(이름·색·로고)가 바뀝니다.

```ts
export const crew = {
  name: "RUN CREW",      // 크루 이름
  tagline: "함께 달리는 즐거움",
  logoEmoji: "🏃",        // 이미지 로고 생기면 교체
  primary: "#FF4D2E",    // 포인트 색
  accent: "#1A1A1A",
};
```

## 구조

```
app/
  page.tsx          # 홈 (기능 런처)
  card/page.tsx     # 1단계: 기록 인증 카드 생성기
components/
  SiteHeader.tsx
  RecordCard.tsx    # 공유 카드 비주얼 (캡처 대상)
lib/
  crew.ts           # 크루 브랜딩 설정
  features.ts       # 기능 목록 / 출시 상태
  format.ts         # 페이스·시간·날짜 계산
```
