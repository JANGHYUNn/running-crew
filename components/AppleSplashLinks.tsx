// iOS 설치형 앱(Add to Home Screen) 실행 시 JS 로드 전에 깔리는 정지 스플래시.
// iOS 는 manifest 를 안 쓰고 apple-touch-startup-image 링크로 처리하며,
// 기기별로 화면 해상도(px)·dpr·방향이 정확히 일치해야만 적용된다.
// 이미지는 솔리드 검정(#1A1A1A) → 인앱 로고 드로잉 스플래시로 이음새 없이 연결.
// (React 19 가 <link> 를 <head> 로 hoist)
const SPLASH = [
  { w: 320, h: 568, r: 2, px: "640x1136" }, // SE 1st
  { w: 375, h: 667, r: 2, px: "750x1334" }, // 8, SE 2/3
  { w: 414, h: 736, r: 3, px: "1242x2208" }, // 8 Plus
  { w: 375, h: 812, r: 3, px: "1125x2436" }, // X, XS, 11 Pro, 12/13 mini
  { w: 414, h: 896, r: 2, px: "828x1792" }, // XR, 11
  { w: 414, h: 896, r: 3, px: "1242x2688" }, // XS Max, 11 Pro Max
  { w: 390, h: 844, r: 3, px: "1170x2532" }, // 12/13/14, 12/13 Pro
  { w: 428, h: 926, r: 3, px: "1284x2778" }, // 12/13 Pro Max, 14 Plus
  { w: 393, h: 852, r: 3, px: "1179x2556" }, // 14 Pro, 15/16, 15 Pro
  { w: 430, h: 932, r: 3, px: "1290x2796" }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { w: 402, h: 874, r: 3, px: "1206x2622" }, // 16 Pro
  { w: 440, h: 956, r: 3, px: "1320x2868" }, // 16 Pro Max
] as const;

export default function AppleSplashLinks() {
  return (
    <>
      {SPLASH.map((s) => (
        <link
          key={s.px}
          rel="apple-touch-startup-image"
          media={`screen and (device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: portrait)`}
          href={`/splash/splash-${s.px}.png`}
        />
      ))}
    </>
  );
}
