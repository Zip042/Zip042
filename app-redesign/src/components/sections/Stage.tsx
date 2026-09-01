import type { ReactNode } from "react";
import { Reveal } from "@/components/motion";

/**
 * 한 화면에 하나씩 — 긴 스크롤 랜딩의 기본 단위.
 *
 * 모든 구획이 같은 리듬을 갖도록 여기서만 높이와 여백을 정합니다.
 * 문장은 최소로 두고(눈길표시 + 제목 한 줄) 나머지 공간은 그림에 내줍니다.
 */
export default function Stage({
  eyebrow,
  title,
  caption,
  tone = "light",
  children,
  wide,
}: {
  eyebrow?: string;
  title: ReactNode;
  caption?: string;
  tone?: "light" | "surface" | "dark";
  children: ReactNode;
  wide?: boolean;
}) {
  const bg = {
    light: "bg-white",
    surface: "bg-surface border-y border-line",
    dark: "bg-ink-900 text-white",
  }[tone];

  return (
    <section className={`relative flex min-h-screen items-center overflow-hidden py-24 ${bg}`}>
      <div className={`mx-auto w-full px-6 lg:px-12 ${wide ? "max-w-[1700px]" : "max-w-[1500px]"}`}>
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            {eyebrow && (
              <p
                className={`text-[13px] font-semibold tracking-wide ${
                  tone === "dark" ? "text-brand-400" : "text-brand-600"
                }`}
              >
                {eyebrow}
              </p>
            )}
            <h2 className="mt-4 text-[clamp(30px,4.4vw,60px)] font-bold leading-[1.1] tracking-[-0.04em]">
              {title}
            </h2>
            {caption && (
              <p
                className={`mx-auto mt-5 max-w-lg text-[15px] leading-relaxed sm:text-[16px] ${
                  tone === "dark" ? "text-white/50" : "text-ink-500"
                }`}
              >
                {caption}
              </p>
            )}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <div className="mt-14 lg:mt-16">{children}</div>
        </Reveal>
      </div>
    </section>
  );
}
