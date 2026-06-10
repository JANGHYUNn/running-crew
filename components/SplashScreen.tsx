import { crew } from "@/lib/crew";

// 설치형 앱(standalone) 실행 시 "로고가 그려지는" 인앱 스플래시.
// 서버 렌더(첫 HTML에 포함) + 페인트 전 인라인 스크립트로 표시 → 메인페이지 깜빡임 없음.
// React 마운트 불필요(정적 마크업 + CSS 애니메이션). 표시/제거는 html[data-splash] 로 제어.
//
// 게이팅: ?splash=1(테스트) 또는 (standalone && 콜드 실행). 앱 내부 페이지 이동(referrer 동일출처)은 제외.
// ⚠️ 로고는 원본 벡터가 없어 SVG로 재구성한 근사 버전. 실제 벡터가 생기면 아래 SVG만 교체.
export default function SplashScreen() {
  const script = `(function(){try{
var f=location.search.indexOf('splash')>-1,
s=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
i=document.referrer&&document.referrer.indexOf(location.origin)===0;
if(f||(s&&!i)){var d=document.documentElement;d.setAttribute('data-splash','on');
setTimeout(function(){d.setAttribute('data-splash','leaving')},1700);
setTimeout(function(){d.removeAttribute('data-splash')},2150);}
}catch(e){}})();`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <div className="splash" style={{ backgroundColor: crew.accent }} aria-hidden>
        <svg
          className="splash__art"
          viewBox="0 0 300 150"
          role="img"
          aria-label={crew.name}
        >
          <text className="splash__name" x="150" y="78" textAnchor="middle">
            11.1K
          </text>
          <path
            className="splash__swoosh"
            d="M52 100 C 110 86, 190 86, 248 100"
            pathLength={1}
          />
          <text className="splash__sub" x="150" y="126" textAnchor="middle">
            INCHEON RUNNING CREW
          </text>
        </svg>
      </div>
    </>
  );
}
