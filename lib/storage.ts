// 증빙 이미지 업로드(Supabase Storage 'proofs' 공개 버킷).
import { getSupabase } from "@/lib/supabase";

const BUCKET = "proofs";

/** Blob 업로드 후 공개 URL 반환 */
export async function uploadProof(blob: Blob): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase 가 설정되지 않았습니다.");

  // 고유 파일명(시간+랜덤) — 브라우저 코드라 Date/Math 사용 무방
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await client.storage.from(BUCKET).upload(name, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return client.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}
