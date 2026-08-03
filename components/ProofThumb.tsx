"use client";

// 인증 이미지 목록 썸네일.
// 목록에서는 작은 썸네일(-thumb.jpg)만 받아 egress 를 아끼고, 클릭하면 원본을 연다.
// 썸네일이 없는 과거 기록은 onError 로 원본에 폴백한다.
import { useState } from "react";
import { thumbUrl } from "@/lib/storage";

export default function ProofThumb({
  url,
  className,
}: {
  url: string;
  className: string;
}) {
  const [src, setSrc] = useState(() => thumbUrl(url));

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0"
      title="인증 이미지 보기"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="인증"
        loading="lazy"
        decoding="async"
        className={className}
        onError={() => setSrc(url)}
      />
    </a>
  );
}
