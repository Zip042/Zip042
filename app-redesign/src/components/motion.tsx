import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 스크롤로 들어올 때 한 번만 올라오는 래퍼.
 * IntersectionObserver 만 쓰고 라이브러리를 두지 않습니다 — 이 정도 연출에
 * 애니메이션 의존성을 더하면 번들만 커집니다.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 안전장치가 중요합니다. 이 연출은 기본 상태가 opacity:0 이라, 관찰자가
    // 어떤 이유로든 발동하지 않으면 **내용이 통째로 안 보입니다**. 연출이 실패해도
    // 글은 반드시 보여야 하므로 세 겹으로 막습니다.
    //   1) 지원하지 않는 브라우저 → 즉시 표시
    //   2) 이미 화면 안에 있으면 → 즉시 표시
    //   3) 그래도 안 되면 1.2초 뒤 강제 표시
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);

    const failsafe = window.setTimeout(() => setShown(true), 1200);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** 화면에 들어왔는지 알려줍니다. 숫자 카운트업·막대 채우기 시작점으로 씁니다. */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    const failsafe = window.setTimeout(() => setInView(true), 1500);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return { ref, inView };
}

/** 0 → target 카운트업. 금액을 강조할 때만 씁니다. */
export function useCountUp(target: number, run: boolean, ms = 900) {
  const [v, setV] = useState(0);

  useEffect(() => {
    if (!run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      // ease-out — 끝에서 부드럽게 멈춥니다
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);

  return v;
}
