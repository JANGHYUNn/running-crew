import { forwardRef } from "react";
import { crew } from "@/lib/crew";

export type CardRatio = "story" | "square";

export interface RecordCardData {
  photo: string | null;
  distance: string; // "8.24"
  pace: string; // "5'32\""
  duration: string; // "45:30"
  dateDot: string; // "2026.06.02"
  location: string; // "한강 반포지구"
  runner: string; // "홍길동"
  ratio: CardRatio;
}

/** 미리보기/내보내기 공통 카드 크기 (px). 내보낼 땐 pixelRatio 3배로 1080폭 */
export const CARD_SIZE: Record<CardRatio, { w: number; h: number }> = {
  story: { w: 360, h: 640 },
  square: { w: 360, h: 360 },
};

const RecordCard = forwardRef<HTMLDivElement, RecordCardData>(
  function RecordCard(data, ref) {
    const { w, h } = CARD_SIZE[data.ratio];

    return (
      <div
        ref={ref}
        style={{
          width: w,
          height: h,
          backgroundColor: crew.accent,
          color: "#fff",
        }}
        className="relative overflow-hidden"
      >
        {/* 배경 사진 */}
        {data.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.photo}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        )}

        {/* 가독성용 그라데이션 오버레이 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.78) 100%)",
          }}
        />

        {/* 내용 */}
        <div className="relative flex h-full flex-col justify-between p-6">
          {/* 상단: 위치 / 날짜 */}
          <div className="flex items-start justify-between text-[13px] font-medium opacity-90">
            <span>{data.location || " "}</span>
            <span className="tnum">{data.dateDot}</span>
          </div>

          {/* 하단: 기록 */}
          <div>
            <div className="flex items-end gap-2">
              <span
                className="tnum font-bold leading-none"
                style={{ fontSize: data.ratio === "story" ? 76 : 60 }}
              >
                {data.distance || "0.00"}
              </span>
              <span className="mb-1 text-2xl font-bold opacity-80">KM</span>
            </div>

            <div className="mt-3 flex gap-6 text-sm">
              <Stat label="페이스" value={data.pace} />
              <Stat label="시간" value={data.duration} />
              {data.runner && <Stat label="러너" value={data.runner} />}
            </div>

            {/* 크루 푸터 */}
            <div className="mt-5 flex items-center gap-2 border-t border-white/20 pt-3">
              <span className="text-lg">{crew.logoEmoji}</span>
              <span className="font-bold" style={{ color: crew.primary }}>
                {crew.name}
              </span>
              <span className="ml-auto text-[11px] opacity-60">
                {crew.tagline}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide opacity-60">
        {label}
      </div>
      <div className="tnum text-lg font-semibold">{value}</div>
    </div>
  );
}

export default RecordCard;
