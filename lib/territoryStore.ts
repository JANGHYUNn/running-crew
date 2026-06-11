// 땅따먹기 Supabase 스토어 — 점령 셀 읽기/쓰기.
// 정적 export라 모두 브라우저에서 직접 호출. 쓰기는 claim_cells RPC 경유(supabase/territory.sql).
import { getSupabase } from "@/lib/supabase";
import type { Cell } from "@/lib/territory";

function sb() {
  const c = getSupabase();
  if (!c) throw new Error("Supabase 가 설정되지 않았습니다.");
  return c;
}

/** 점령된 셀 1칸 */
export interface OwnedCell {
  x: number;
  y: number;
  userId: string;
  ownerName: string | null;
}

const PAGE = 1000; // Supabase 기본 응답 상한

/** 전체 점령 현황(셀 누적이 1000행을 넘을 수 있어 페이지네이션) */
export async function fetchCells(): Promise<OwnedCell[]> {
  const out: OwnedCell[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb()
      .from("territory_cells")
      .select("x,y,user_id,owner_name")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows) {
      out.push({ x: r.x, y: r.y, userId: r.user_id, ownerName: r.owner_name });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** 셀 묶음을 내 명의로 점령(최신 우선). 반환: 새로 점령/갱신된 셀 수. */
export async function claimCells(
  cells: Cell[],
  ownerName: string,
  claimedAt: string,
  activityId: string
): Promise<number> {
  if (cells.length === 0) return 0;
  const payload = cells.map((c) => ({ k: `${c.x}_${c.y}`, x: c.x, y: c.y }));
  const { data, error } = await sb().rpc("claim_cells", {
    cells: payload,
    p_owner_name: ownerName,
    p_claimed_at: claimedAt,
    p_activity_id: activityId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}
