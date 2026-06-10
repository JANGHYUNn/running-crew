// 개인정보처리방침 — intervals.icu OAuth 앱 등록에 필요한 공개 페이지.
// 정적 페이지(클라이언트 상태 없음).
import { crew } from "@/lib/crew";

export const metadata = {
  title: `개인정보처리방침 · ${crew.name}`,
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-neutral-700">
      <h1 className="text-xl font-bold text-neutral-900">개인정보처리방침</h1>
      <p className="mt-1 text-xs text-neutral-400">최종 업데이트: 2026-06-10</p>

      <Section title="1. 수집·이용하는 정보">
        본 서비스(<b>{crew.name}</b> 크루 웹앱)는 러닝 기록 시각화를 위해 다음을 처리합니다.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>카카오 로그인 시 제공되는 프로필(닉네임·프로필 이미지)과 식별자</li>
          <li>
            사용자가 직접 연동한 intervals.icu 활동 데이터(거리·페이스·시간·GPS 경로 등)
          </li>
          <li>사용자가 업로드한 기록 인증 이미지</li>
        </ul>
      </Section>

      <Section title="2. intervals.icu 연동">
        사용자가 명시적으로 연동(OAuth)을 허용한 경우에만 intervals.icu 활동 데이터를
        가져옵니다. 발급된 접근 토큰은 사용자 계정에 귀속되어 저장되며, 사용자의 활동 경로를
        지도에 표시하는 용도로만 사용합니다. 사용자는 언제든 앱 내에서 연동을 해제할 수
        있고, 해제 시 저장된 토큰은 삭제됩니다.
      </Section>

      <Section title="3. 저장·보관">
        데이터는 Supabase(데이터베이스)에 저장됩니다. 접근 토큰 등 민감 정보는 행 수준 보안
        (RLS)으로 본인만 접근할 수 있도록 제한합니다.
      </Section>

      <Section title="4. 제3자 제공">
        수집한 정보를 외부에 판매하거나 광고 목적으로 제공하지 않습니다. 크루 내부의 기록
        공유·시각화 목적에 한해 사용합니다.
      </Section>

      <Section title="5. 보유 기간 및 삭제">
        계정 또는 연동 해제 시 관련 데이터를 삭제합니다. 삭제를 원하시면 아래 연락처로 요청할
        수 있습니다.
      </Section>

      <Section title="6. 문의">
        개인정보 관련 문의는 크루 운영자에게 연락해 주세요.
        {/* TODO: 실제 연락처(이메일) 기입 */}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-bold text-neutral-900">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}
