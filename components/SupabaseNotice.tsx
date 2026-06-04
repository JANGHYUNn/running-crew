// Supabase 미설정 시 챌린지 페이지들이 공통으로 띄우는 안내.
// 빌드는 통과하되, 키를 넣기 전까진 기능 대신 설정 방법을 보여준다.
export default function SupabaseNotice() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-sm leading-relaxed text-neutral-600">
        <h1 className="mb-2 text-base font-bold text-neutral-900">
          ⚙️ 챌린지 기능 설정이 필요해요
        </h1>
        <p className="mb-3">
          조별 누적거리 챌린지는 공유 데이터 저장을 위해 무료 Supabase 가 필요합니다.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              supabase.com
            </a>{" "}
            에서 무료 프로젝트 생성
          </li>
          <li>
            <code className="rounded bg-neutral-100 px-1">supabase/schema.sql</code>{" "}
            내용을 SQL Editor 에 붙여넣어 실행
          </li>
          <li>
            Project Settings → API 의 URL·anon key 를{" "}
            <code className="rounded bg-neutral-100 px-1">.env.local</code> 에 입력
            (<code className="rounded bg-neutral-100 px-1">.env.local.example</code>{" "}
            참고)
          </li>
          <li>개발 서버 재시작 / 배포 빌드 환경변수에도 등록</li>
        </ol>
      </div>
    </div>
  );
}
