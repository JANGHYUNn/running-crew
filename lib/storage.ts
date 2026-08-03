// 증빙 이미지 업로드(Supabase Storage 'proofs' 공개 버킷).
import { getSupabase } from "@/lib/supabase";

const BUCKET = "proofs";

// 인증 이미지는 한 번 올리면 바뀌지 않으므로 최대한 길게 캐시(1년).
// 브라우저/CDN 재사용률을 올려 무료 플랜 egress(5GB/월)를 아낀다.
const CACHE_CONTROL = "31536000";

/** 원본 URL → 목록용 썸네일 URL(파일명 규칙: foo.jpg → foo-thumb.jpg) */
export function thumbUrl(url: string): string {
  return url.replace(/\.jpg(\?.*)?$/, "-thumb.jpg$1");
}

/**
 * 원본 + 목록용 썸네일을 함께 업로드하고 원본 공개 URL 반환.
 * 썸네일은 같은 이름에 `-thumb` 를 붙여 저장하므로 DB 컬럼 추가가 필요 없다.
 * (썸네일이 없는 과거 기록은 화면에서 원본으로 폴백)
 */
export async function uploadProof(blob: Blob, thumb?: Blob): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase 가 설정되지 않았습니다.");

  // 고유 파일명(시간+랜덤) — 브라우저 코드라 Date/Math 사용 무방
  const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { error } = await client.storage.from(BUCKET).upload(`${base}.jpg`, blob, {
    contentType: "image/jpeg",
    cacheControl: CACHE_CONTROL,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  // 썸네일 실패는 치명적이지 않다(원본 폴백으로 계속 동작) → 조용히 무시
  if (thumb) {
    await client.storage
      .from(BUCKET)
      .upload(`${base}-thumb.jpg`, thumb, {
        contentType: "image/jpeg",
        cacheControl: CACHE_CONTROL,
        upsert: false,
      })
      .catch(() => undefined);
  }

  return client.storage.from(BUCKET).getPublicUrl(`${base}.jpg`).data.publicUrl;
}
