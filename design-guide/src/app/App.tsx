import { useState } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle,
  Copy, Check, ChevronRight, ShieldCheck, Palette
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   등기지킴이 — Design System v0.3
   브랜드 컬러 2종 비교 버전
══════════════════════════════════════════════════════ */

// ── Theme definitions ──────────────────────────────────
const THEMES = {
  red: {
    key: "red",
    label: "레드",
    description: "신뢰·경고·행동 유도",
    primary:      "#C0404A",   // 따뜻한 크림슨. 순수 빨강보다 채도를 낮춰 공격적이지 않게.
    primaryHover: "#A83540",
    primaryLight: "#FDECED",
    background:   "#FFF8F8",
    border:       "rgba(192,64,74,0.12)",
    switchBg:     "#F8C8CB",
    swatch: ["#C0404A", "#D9696F", "#F2B8BB", "#FDECED"],
    note: "위험·경고와 색상 의미가 겹칠 수 있어 Semantic Color 운용에 주의 필요",
    pros: ["위험 정보에 대한 즉각적 인지", "행동 유도력 강함", "등기·계약 위험 서비스에 직관적"],
    cons: ["Danger(빨강)와 브랜드 색 충돌 위험", "전체 톤이 무거워질 수 있음", "장시간 사용 시 피로감"],
  },
  green: {
    key: "green",
    label: "그린",
    description: "신뢰·안전·전문성",
    primary:      "#2A8C5F",   // 차분한 에메랄드 그린. 순수 초록보다 청색 기미 추가로 신뢰감 상승.
    primaryHover: "#22754E",
    primaryLight: "#E6F5EE",
    background:   "#F4FBF7",
    border:       "rgba(42,140,95,0.12)",
    switchBg:     "#A8D8BF",
    swatch: ["#2A8C5F", "#52A87D", "#9DD4B8", "#E6F5EE"],
    note: "Safe(초록)와 색상 의미가 겹칠 수 있어 Semantic Color 운용에 주의 필요",
    pros: ["안전·신뢰 이미지 강화", "Safe 판정과 브랜드 톤 일치", "장시간 사용 편안함"],
    cons: ["Safe(초록)와 브랜드 색 충돌 위험", "행동 유도력이 Red보다 약함", "경쟁 서비스와 유사할 수 있음"],
  },
} as const;

type ThemeKey = keyof typeof THEMES;

// ── Utilities ──────────────────────────────────────────
function CopyToken({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
      className="ml-auto p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/5"
    >
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} className="text-muted-foreground" />}
    </button>
  );
}

function Swatch({ name, value, note, primary }: { name: string; value: string; note?: string; primary: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-border group hover:border-opacity-60 transition-colors" style={{ borderColor: `${primary}25` }}>
      <div className="w-8 h-8 rounded-md shrink-0 border border-black/8" style={{ background: value }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground font-mono">{value}</p>
        {note && <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>}
      </div>
      <CopyToken value={value} />
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-relaxed">
      <span className="mt-2 w-1 h-1 rounded-full shrink-0 bg-current opacity-40" />
      <span>{children}</span>
    </li>
  );
}

function Principle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 pl-4 py-1 border-current/20">
      <p className="text-sm font-bold mb-1">{title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function AntiPattern({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-border">
      <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-bold">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{reason}</p>
      </div>
    </div>
  );
}

function Pattern({ label, when, notWhen }: { label: string; when: string; notWhen?: string }) {
  return (
    <div className="p-4 bg-white rounded-lg border border-border">
      <p className="text-xs font-black mb-2">{label}</p>
      <p className="text-[11px] text-muted-foreground"><span className="font-bold text-emerald-600">사용 ·</span> {when}</p>
      {notWhen && <p className="text-[11px] text-muted-foreground mt-1"><span className="font-bold text-red-500">지양 ·</span> {notWhen}</p>}
    </div>
  );
}

function Section({ id, tier, title, sub, children, primary }: {
  id: string; tier: "A" | "B" | "C" | "D" | "—"; title: string; sub?: string;
  children: React.ReactNode; primary: string;
}) {
  const tierBg: Record<string, string> = { A: primary, B: "#7c3aed", C: "#0891b2", D: "#dc2626", "—": "#6b7280" };
  return (
    <section id={id} className="scroll-mt-20 mb-20">
      <div className="mb-8 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black px-2 py-0.5 rounded text-white" style={{ background: tierBg[tier] }}>
            {tier !== "—" ? `Tier ${tier}` : "원칙"}
          </span>
          <p className="text-[11px] font-black tracking-widest uppercase text-muted-foreground">{id}</p>
        </div>
        <h2 className="text-xl font-black">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

const sideNavItems = [
  "소개", "컬러 비교", "foundation", "principles", "patterns", "anti-patterns", "creative-direction", "일관성", "design-decision"
];

export default function App() {
  const [themeKey, setThemeKey] = useState<ThemeKey>("red");
  const [activeNav, setActiveNav] = useState("소개");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeCheck, setActiveCheck] = useState("계약 전");
  const [copied, setCopied] = useState(false);

  const theme = THEMES[themeKey];
  const other = THEMES[themeKey === "red" ? "green" : "red"];
  const P = theme.primary;

  return (
    <div
      className="min-h-screen text-foreground flex"
      style={{ fontFamily: "'Noto Sans KR', sans-serif", background: theme.background }}
    >

      {/* ── Color toggle — fixed top right ── */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-white rounded-2xl shadow-lg border border-border px-3 py-2.5">
        <Palette size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground font-medium hidden sm:block">브랜드 컬러</span>
        <div className="flex items-center gap-1 ml-1">
          {(["red", "green"] as ThemeKey[]).map((key) => {
            const t = THEMES[key];
            const isActive = themeKey === key;
            return (
              <button
                key={key}
                onClick={() => setThemeKey(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isActive ? "text-white shadow-sm" : "text-muted-foreground hover:bg-secondary"
                }`}
                style={isActive ? { background: t.primary } : {}}
                title={`${t.label} · ${t.primary}`}
              >
                <span className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0" style={{ background: t.primary }} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <aside
        className="hidden lg:flex flex-col w-60 shrink-0 sticky top-0 h-screen border-r overflow-y-auto"
        style={{ background: "white", borderColor: theme.border }}
      >
        <div className="p-5 border-b" style={{ borderColor: theme.border }}>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Design System</p>
          <p className="font-black text-lg" style={{ color: P, fontFamily: "'Nunito', sans-serif" }}>등기지킴이</p>
          <p className="text-[10px] text-muted-foreground">v0.3 · 2026.08.18</p>
          {/* Mini color badge */}
          <div className="mt-3 flex items-center gap-2 p-2 rounded-lg" style={{ background: theme.primaryLight }}>
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: P }} />
            <span className="text-[11px] font-bold" style={{ color: P }}>{theme.label} · {P}</span>
          </div>
        </div>
        <nav className="p-3 flex flex-col gap-0.5 flex-1 overflow-y-auto">
          {sideNavItems.map((item) => (
            <a
              key={item}
              href={`#${item}`}
              onClick={() => setActiveNav(item)}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={
                activeNav === item
                  ? { background: theme.primaryLight, color: P, fontWeight: 700 }
                  : { color: "#a07080" }
              }
            >
              {item === "foundation" ? "A · Foundation" :
               item === "principles" ? "B · Principles" :
               item === "patterns"   ? "C · Patterns" :
               item === "anti-patterns" ? "D · Anti-patterns" :
               item === "creative-direction" ? "Creative Direction" :
               item === "design-decision" ? "Design Decision" :
               item}
            </a>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 min-w-0 px-6 md:px-12 py-10 max-w-4xl">

        {/* ── 소개 ── */}
        <section id="소개" className="scroll-mt-20 mb-20">
          <div className="mb-6">
            <p className="text-[11px] font-black tracking-widest uppercase text-muted-foreground mb-3">등기지킴이 Design System v0.3</p>
            <h1 className="text-3xl md:text-4xl font-black mb-4" style={{ fontFamily: "'Nunito', 'Noto Sans KR', sans-serif" }}>
              Design System,<br />not a UI Recipe
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              브랜드 정체성과 UX 품질을 유지하면서, 각 화면을 그 목적에 맞게 자유롭고 창의적으로 설계할 수 있도록 하는 시스템입니다.
              <strong> 우측 상단 버튼으로 두 가지 브랜드 컬러를 비교할 수 있습니다.</strong>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { tier: "A", color: P,        title: "Foundation",        desc: "브랜드 색상, 타이포그래피, 접근성. 반드시 유지." },
              { tier: "B", color: "#7c3aed", title: "Principles",        desc: "UX·Visual 원칙. CSS 값을 강제하지 않음." },
              { tier: "C", color: "#0891b2", title: "Flexible Patterns", desc: "상황에 따라 선택. 기본값 없음." },
              { tier: "D", color: "#dc2626", title: "Anti-patterns",     desc: "생성형 AI UI 습관 경계. 금지가 아닌 caution." },
            ].map((t) => (
              <div key={t.tier} className="flex gap-3 p-4 bg-white rounded-xl border" style={{ borderColor: theme.border }}>
                <span className="text-xs font-black px-2 py-1 rounded text-white h-fit shrink-0" style={{ background: t.color }}>{t.tier}</span>
                <div>
                  <p className="text-sm font-black mb-1">{t.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════
            COLOR COMPARISON
        ══════════════════════════════ */}
        <section id="컬러 비교" className="scroll-mt-20 mb-20">
          <div className="mb-8 pb-4 border-b" style={{ borderColor: theme.border }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black px-2 py-0.5 rounded text-white" style={{ background: P }}>비교</span>
              <p className="text-[11px] font-black tracking-widest uppercase text-muted-foreground">컬러 비교</p>
            </div>
            <h2 className="text-xl font-black">브랜드 컬러 2종 비교</h2>
            <p className="text-sm text-muted-foreground mt-1">우측 상단 버튼으로 실제 가이드에 적용된 모습을 전환해보세요.</p>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {(["red", "green"] as ThemeKey[]).map((key) => {
              const t = THEMES[key];
              const isActive = themeKey === key;
              return (
                <div
                  key={key}
                  className="rounded-2xl border-2 overflow-hidden transition-all"
                  style={{ borderColor: isActive ? t.primary : "#e5e7eb" }}
                >
                  {/* Header */}
                  <div className="p-5" style={{ background: t.primary }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-white font-black text-lg" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        {t.label}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-black bg-white/25 text-white px-2.5 py-1 rounded-full">현재 적용 중</span>
                      )}
                    </div>
                    <p className="text-white/80 text-xs mb-4">{t.description}</p>
                    {/* Swatch row */}
                    <div className="flex gap-2">
                      {t.swatch.map((s) => (
                        <div key={s} className="flex-1 h-8 rounded-lg border border-white/20" style={{ background: s }} />
                      ))}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-5 bg-white space-y-4">
                    {/* Color values */}
                    <div className="space-y-1.5">
                      {[
                        { n: "Primary",       v: t.primary },
                        { n: "Primary Hover", v: t.primaryHover },
                        { n: "Primary Light", v: t.primaryLight },
                        { n: "Background",    v: t.background },
                      ].map((c) => (
                        <div key={c.n} className="flex items-center gap-2 text-xs">
                          <div className="w-5 h-5 rounded shrink-0 border border-black/8" style={{ background: c.v }} />
                          <span className="text-muted-foreground w-24 shrink-0">{c.n}</span>
                          <span className="font-mono font-bold">{c.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Component preview */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2">컴포넌트 미리보기</p>
                      {/* Buttons */}
                      <div className="flex gap-2 flex-wrap">
                        <button className="px-4 py-2 rounded-xl text-xs font-black text-white" style={{ background: t.primary }}>
                          Primary 버튼
                        </button>
                        <button className="px-4 py-2 rounded-xl text-xs font-bold border-2" style={{ borderColor: t.primary, color: t.primary }}>
                          Secondary
                        </button>
                      </div>
                      {/* Badge & tag */}
                      <div className="flex gap-2 flex-wrap items-center">
                        <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white" style={{ background: t.primary }}>
                          뱃지
                        </span>
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: t.primaryLight, color: t.primary }}>
                          태그
                        </span>
                        <span className="text-[11px] font-black" style={{ color: t.primary }}>링크 텍스트 →</span>
                      </div>
                      {/* Stat card */}
                      <div className="p-3 rounded-xl border" style={{ background: t.primaryLight, borderColor: `${t.primary}20` }}>
                        <p className="text-[10px] text-muted-foreground">전국 평균 분석 시간</p>
                        <p className="text-lg font-black" style={{ color: t.primary }}>28초</p>
                        <p className="text-[10px]" style={{ color: t.primaryHover }}>↑ 전월 대비 3초 단축</p>
                      </div>
                    </div>

                    {/* Pros & Cons */}
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <div>
                        <p className="text-[10px] font-black text-emerald-600 mb-1">장점</p>
                        {t.pros.map((p) => (
                          <p key={p} className="text-[11px] text-muted-foreground flex gap-1.5">
                            <CheckCircle2 size={11} className="text-emerald-500 mt-0.5 shrink-0" />{p}
                          </p>
                        ))}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-red-500 mb-1">고려사항</p>
                        {t.cons.map((c) => (
                          <p key={c} className="text-[11px] text-muted-foreground flex gap-1.5">
                            <AlertTriangle size={11} className="text-amber-400 mt-0.5 shrink-0" />{c}
                          </p>
                        ))}
                      </div>
                    </div>

                    {/* Warning about semantic conflict */}
                    <div className="p-2.5 rounded-lg text-[11px]" style={{ background: `${t.primary}10`, color: t.primary }}>
                      ⚠ {t.note}
                    </div>

                    <button
                      onClick={() => setThemeKey(key)}
                      className="w-full py-2.5 rounded-xl text-xs font-black transition-all text-white"
                      style={{ background: isActive ? t.primary : "#e5e7eb", color: isActive ? "white" : "#9ca3af" }}
                    >
                      {isActive ? "✓ 현재 적용됨" : `${t.label} 적용해보기`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Semantic color conflict note */}
          <div className="p-5 bg-white rounded-2xl border" style={{ borderColor: theme.border }}>
            <p className="text-sm font-black mb-3">⚠ Semantic Color와의 관계</p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              두 색상 모두 Semantic Color(Safe=초록, Danger=빨강)와 의미가 겹칠 수 있습니다.
              브랜드 컬러를 선택한 후, 아래 중 한 가지 방법으로 충돌을 해소해야 합니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {[
                { method: "방법 A · 채도 차별화", desc: "브랜드 컬러는 현재 정의된 채도를 유지하고, Semantic Color는 더 순수하거나 더 연한 톤으로 분리." },
                { method: "방법 B · 형태 차별화", desc: "Semantic Color는 항상 아이콘+텍스트 레이블을 동반. 브랜드 컬러는 인터랙티브 요소에만 단독 사용." },
                { method: "방법 C · 위치 차별화", desc: "Semantic Color는 분석 결과 화면 전용. 브랜드 컬러는 GNB, CTA, 링크 등 UI 요소 전용으로 영역 분리." },
                { method: "방법 D · 타협안", desc: "Safe/Danger의 기준 색은 유지하되 브랜드를 보라·파랑 계열로 재검토. (현재 논의 외 옵션)" },
              ].map((m) => (
                <div key={m.method} className="p-3 rounded-xl border" style={{ borderColor: theme.border, background: theme.primaryLight }}>
                  <p className="font-black mb-1" style={{ color: P }}>{m.method}</p>
                  <p className="text-muted-foreground leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════
            TIER A · FOUNDATION
        ══════════════════════════════ */}

        <div id="foundation" className="scroll-mt-20 mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-[10px] font-black px-2 py-0.5 rounded text-white" style={{ background: P }}>Tier A</span>
            <h2 className="text-2xl font-black">Foundation</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-8">서비스의 정체성. 모든 화면에서 반드시 유지되어야 하는 요소.</p>
        </div>

        {/* A1. Brand Colors */}
        <section className="mb-12">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">A-1 · 브랜드 컬러</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[11px] font-black text-muted-foreground mb-2">Brand (현재: {theme.label})</p>
              <div className="space-y-2">
                <Swatch name="Primary" value={theme.primary} note="CTA, 강조, 브랜드 식별자" primary={P} />
                <Swatch name="Primary Hover" value={theme.primaryHover} note="Primary 인터랙션 상태" primary={P} />
                <Swatch name="Primary Light" value={theme.primaryLight} note="배경 tint, 아이콘 컨테이너" primary={P} />
                <Swatch name="Background" value={theme.background} note="페이지 기본 배경" primary={P} />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black text-muted-foreground mb-2">Neutral (공통 · 컬러 무관)</p>
              <div className="space-y-2">
                <Swatch name="Surface" value="#FFFFFF" note="카드, 패널, 인풋 배경" primary={P} />
                <Swatch name="Foreground" value="#1A1020" note="기본 텍스트" primary={P} />
                <Swatch name="Muted FG" value="#A07080" note="보조 텍스트, 라벨, 캡션" primary={P} />
                <Swatch name="Border" value={theme.border} note="구분선, 카드 외곽" primary={P} />
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white border" style={{ borderColor: theme.border }}>
            <p className="text-xs font-black mb-2">사용 원칙</p>
            <ul className="space-y-1.5" style={{ color: P }}>
              <Rule>Primary는 사용자의 핵심 행동을 유도하는 곳에만. 많이 쓸수록 강조 효과가 희석된다.</Rule>
              <Rule>배경은 theme.background와 #FFFFFF 두 가지만. 두 값의 차이로 레이어 depth를 표현한다.</Rule>
              <Rule>텍스트에 Primary 색상을 쓸 경우 배경과의 명도 대비를 반드시 확인한다 (4.5:1 이상).</Rule>
            </ul>
          </div>
        </section>

        {/* A2. Semantic Colors */}
        <section className="mb-12">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">A-2 · Semantic Color (상태 표현)</p>
          <p className="text-sm text-muted-foreground mb-4">
            Safe / Caution / Danger 체계는 서비스의 핵심 가치입니다. 브랜드 컬러와 무관하게 동일하게 유지됩니다.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { status: "Safe · 안전",    bg: "#ECFDF5", border: "#A7F3D0", text: "#059669", icon: CheckCircle2 },
              { status: "Caution · 주의", bg: "#FFFBEB", border: "#FDE68A", text: "#D97706", icon: AlertTriangle },
              { status: "Danger · 위험",  bg: "#FEF2F2", border: "#FECACA", text: "#EF4444", icon: XCircle },
            ].map((s) => (
              <div key={s.status} className="rounded-xl border p-4" style={{ background: s.bg, borderColor: s.border }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <s.icon size={14} style={{ color: s.text }} />
                  <p className="text-xs font-black" style={{ color: s.text }}>{s.status}</p>
                </div>
                <p className="text-[10px] font-mono" style={{ color: s.text }}>{s.bg}</p>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-xl bg-white border" style={{ borderColor: theme.border }}>
            <p className="text-xs font-black mb-2">사용 원칙</p>
            <ul className="space-y-1.5" style={{ color: P }}>
              <Rule>분석 결과 화면 전용. 다른 목적(장식, 강조)으로 전용하지 않는다.</Rule>
              <Rule>상태는 색상만으로 전달하지 않는다. 아이콘 또는 텍스트 레이블을 반드시 함께 사용한다.</Rule>
              <Rule>위험 정보는 명확하게 전달하되 불필요한 공포감을 주지 않도록 톤을 조절한다.</Rule>
            </ul>
          </div>
        </section>

        {/* A3. Typography */}
        <section className="mb-12">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">A-3 · 타이포그래피</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="p-5 bg-white rounded-xl border" style={{ borderColor: theme.border }}>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider mb-3">Display</p>
              <p className="text-3xl font-black mb-1" style={{ fontFamily: "'Nunito', sans-serif", color: P }}>Nunito</p>
              <p className="text-xs text-muted-foreground">브랜드명, 히어로 제목, 핵심 메시지</p>
            </div>
            <div className="p-5 bg-white rounded-xl border" style={{ borderColor: theme.border }}>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider mb-3">Body</p>
              <p className="text-2xl font-bold mb-1">Noto Sans KR</p>
              <p className="text-xs text-muted-foreground">본문, UI 레이블, 설명, 법적 고지 전반</p>
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl border" style={{ borderColor: theme.border }}>
            <p className="text-xs font-black mb-3">Hierarchy 원칙</p>
            <div className="space-y-2">
              {[
                { level: "Level 1", rule: "한 화면에 하나만. 사용자의 첫 시선.", size: "text-3xl~5xl", weight: "font-black" },
                { level: "Level 2", rule: "섹션의 시작을 명확히 표시.", size: "text-xl~3xl", weight: "font-black" },
                { level: "Level 3", rule: "카드·항목 단위의 구분자.", size: "text-sm~base", weight: "font-bold" },
                { level: "Level 4", rule: "읽히는 텍스트. leading-relaxed 확보.", size: "text-sm", weight: "font-normal" },
                { level: "Level 5", rule: "날짜, 라벨, 캡션. muted-foreground.", size: "text-xs", weight: "font-medium" },
              ].map((t) => (
                <div key={t.level} className="flex gap-3 items-start text-xs py-2 border-b border-gray-100 last:border-0">
                  <span className="font-black w-16 shrink-0" style={{ color: P }}>{t.level}</span>
                  <span className="flex-1 text-muted-foreground">{t.rule}</span>
                  <span className="font-mono text-muted-foreground shrink-0 hidden md:block">{t.size}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* A4. Accessibility */}
        <section className="mb-12">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">A-4 · 접근성</p>
          <div className="space-y-2">
            {[
              { rule: "대비",         content: "본문: 4.5:1 이상 / 대형 텍스트(18pt+): 3:1 이상 / 인터랙티브 요소: 3:1 이상" },
              { rule: "색상 단독 금지", content: "Safe/Caution/Danger 상태는 색상만으로 표현하지 않는다. 아이콘 또는 텍스트 레이블 병행 필수." },
              { rule: "포커스 상태",   content: "키보드 탐색 가능한 모든 요소에 포커스 인디케이터 제공. ring 색상은 Primary 사용." },
              { rule: "터치 타겟",     content: "최소 44×44px. 작은 아이콘 버튼도 실제 터치 영역 44px 이상 확보." },
            ].map((a) => (
              <div key={a.rule} className="flex gap-4 p-3 bg-white rounded-lg border text-sm" style={{ borderColor: theme.border }}>
                <span className="font-black shrink-0 w-24" style={{ color: P }}>{a.rule}</span>
                <span className="text-muted-foreground leading-relaxed">{a.content}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════
            TIER B · PRINCIPLES
        ══════════════════════════════ */}
        <Section id="principles" tier="B" title="Principles" primary={P}
          sub="화면을 설계할 때 지켜야 하는 UX·Visual 원칙. 특정 CSS 값이나 레이아웃 형태를 강제하지 않습니다.">
          <div className="space-y-4" style={{ color: P }}>
            {[
              { title: "핵심 행동을 빠르게 식별할 수 있어야 한다", body: "화면마다 사용자의 주된 action이 하나 있어야 하며, 다른 요소보다 명확하게 구분되어야 합니다. 어떻게 구분할지는 화면 구조에 따라 결정합니다." },
              { title: "위험 정보는 놓치기 어렵게 표현해야 한다", body: "Danger 판정은 스크롤을 내려야 보이는 위치에 숨기지 않습니다. 동시에 공포감을 조성하는 과도한 경고 디자인은 피합니다." },
              { title: "Whitespace는 정보 그룹을 표현하기 위해 사용한다", body: "관련 있는 요소를 가깝게, 관련 없는 요소를 멀게 배치하는 것이 여백의 역할입니다. 디자인을 '아이롭게' 보이기 위한 수단이 아닙니다." },
              { title: "Visual 요소에는 명확한 역할이 있어야 한다", body: "새로운 카드, 선, 아이콘 컨테이너, 그라디언트를 추가하기 전에 이 요소가 comprehension·hierarchy·interaction·scanability·semantic·brand 중 하나라도 개선하는지 판단합니다." },
              { title: "정보 hierarchy는 레이아웃보다 타이포그래피로 먼저 해결한다", body: "모든 콘텐츠를 카드 안에 넣어서 구분하는 것보다, 크기·굵기·색상·여백으로 hierarchy를 표현하는 것이 우선입니다." },
              { title: "신뢰감은 명확함에서 온다", body: "이 서비스의 사용자는 계약 위험을 확인하러 옵니다. 불필요한 시각적 복잡성은 신뢰를 낮춥니다." },
            ].map((p) => <Principle key={p.title} title={p.title}>{p.body}</Principle>)}
          </div>
        </Section>

        {/* ══════════════════════════════
            TIER C · FLEXIBLE PATTERNS
        ══════════════════════════════ */}
        <Section id="patterns" tier="C" title="Flexible Patterns" primary={P}
          sub="화면의 목적과 정보 구조에 따라 선택합니다. 특정 패턴을 기본값으로 지정하지 않습니다.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {[
              { label: "Card Grid",             when: "반복 스캔이 필요한 항목 (검색 결과)", notWhen: "단순 정보 나열. hierarchy가 충분한 경우" },
              { label: "Split Layout",           when: "두 콘텐츠를 동시에 보여줄 때 (파일+결과)", notWhen: "한쪽이 압도적으로 중요한 경우" },
              { label: "Linear Workflow",        when: "단계별 진행 태스크 (업로드→분석→결과)", notWhen: "비선형 탐색 콘텐츠" },
              { label: "Editorial Layout",       when: "읽기 중심 콘텐츠 (계약 가이드, 용어 설명)", notWhen: "인터랙션 중심 도구 화면" },
              { label: "Tool-first Interface",   when: "핵심 행동이 명확하고 즉각적 피드백이 있는 화면", notWhen: "정보 탐색 위주 화면" },
              { label: "Progressive Disclosure", when: "모든 정보가 동시에 필요하지 않은 경우 (FAQ)", notWhen: "정보가 단순하거나 항상 보여야 하는 경우" },
            ].map((p) => <Pattern key={p.label} label={p.label} when={p.when} notWhen={p.notWhen} />)}
          </div>

          <div className="p-4 bg-white rounded-xl border" style={{ borderColor: theme.border }}>
            <p className="text-xs font-black mb-2">Card 사용 기준</p>
            <p className="text-xs text-muted-foreground mb-3">다음 중 하나 이상에 해당할 때만 카드 사용 고려.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {["독립된 정보 단위", "Interaction boundary (클릭·선택 가능한 object)", "반복적으로 스캔해야 하는 항목", "사용자가 선택하거나 비교할 수 있는 object"].map((c) => (
                <div key={c} className="flex items-start gap-2 text-xs p-2 rounded-lg" style={{ background: theme.primaryLight }}>
                  <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{c}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-gray-100">
              Typography, spacing, divider만으로 충분한 경우에는 카드를 사용하지 않습니다. Nested card는 특별한 이유가 없는 한 피합니다.
            </p>
          </div>
        </Section>

        {/* ══════════════════════════════
            TIER D · ANTI-PATTERNS
        ══════════════════════════════ */}
        <Section id="anti-patterns" tier="D" title="Anti-patterns" primary={P}
          sub="생성형 AI UI에서 반복되는 무의식적 습관입니다. 금지가 아닌 경계(caution) 목록. 합리적 이유가 있다면 사용 가능합니다.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {[
              { label: "중앙 정렬된 generic SaaS Hero",       reason: "Hero composition은 화면의 핵심 태스크와 콘텐츠 성격에 따라 결정한다." },
              { label: "3개의 동일한 Feature Card",            reason: "정보 구조가 3열이어야 할 이유가 없으면 사용하지 않는다." },
              { label: "모든 콘텐츠를 rounded rectangle 안에", reason: "시각적 분리가 필요하지 않은 곳에도 카드를 씌우는 패턴." },
              { label: "Decorative blob / abstract shape",     reason: "브랜드 identity와 연결되지 않는 장식. 없애도 의미가 손상되지 않으면 제거." },
              { label: "Gradient headline",                     reason: "브랜드 인지·hierarchy·focus 목적 없이 modern해 보이려는 gradient." },
              { label: "과도한 pill UI",                       reason: "모든 버튼·컨테이너를 pill로 만드는 경우. pill은 status·filter에 우선 사용." },
              { label: "Icon + Title + Paragraph 반복",        reason: "화면 전체가 이 단위로만 이루어지는 구성. 정보 구조와 리듬을 단조롭게 만든다." },
              { label: "모든 요소에 shadow 추가",              reason: "그림자가 elevation을 의미한다면, 모두에게 주면 elevation이 없어진다." },
              { label: "동일한 component rhythm을 끝까지 반복", reason: "한 페이지가 동일한 card rhythm으로만 구성. 중요도 차이가 사라진다." },
              { label: "정보와 무관한 gradient",               reason: "단순히 modern해 보이기 위한 gradient 사용." },
            ].map((a) => <AntiPattern key={a.label} label={a.label} reason={a.reason} />)}
          </div>
          <div className="p-4 rounded-xl border border-amber-100 bg-amber-50 text-xs text-amber-800">
            <AlertTriangle size={13} className="inline mr-1.5 mb-0.5 text-amber-500" />
            목적은 특정 디자인을 금지하는 것이 아니라, <strong>무의식적으로 반복되는 생성형 UI 습관을 인식하고 의도적으로 선택하도록</strong> 하는 것입니다.
          </div>
        </Section>

        {/* ── Creative Direction ── */}
        <Section id="creative-direction" tier="—" title="Creative Direction" primary={P}
          sub="각 화면은 동일한 레이아웃을 반복하는 대신 하나의 명확한 Visual Idea를 가질 수 있습니다.">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
            {["사용자 Task", "콘텐츠 구조", "정보 중요도", "사용자 감정", "브랜드 Identity", "Interaction Model"].map((v) => (
              <div key={v} className="flex items-center gap-2 p-3 bg-white rounded-lg border text-xs font-medium" style={{ borderColor: theme.border }}>
                <ChevronRight size={12} style={{ color: P }} className="shrink-0" /> {v}
              </div>
            ))}
          </div>
          <div className="p-4 bg-white rounded-xl border" style={{ borderColor: theme.border }}>
            <p className="text-xs font-black mb-3">화면별 Composition 예시</p>
            <div className="space-y-2">
              {[
                { screen: "업로드·분석 화면", idea: "Tool-first. 업로드 영역이 주인공.", layout: "중앙 집중 또는 split(파일+진행)" },
                { screen: "분석 결과 화면",   idea: "판정이 첫 번째. 위험도가 시각적으로 먼저.", layout: "Linear top-to-bottom 또는 sidebar+detail" },
                { screen: "계약 가이드 화면", idea: "Editorial. 읽기 중심 단계별 체크리스트.", layout: "단일 컬럼 editorial 또는 탭 기반" },
                { screen: "용어 사전 화면",   idea: "탐색 중심. 특정 용어를 빠르게 찾을 수 있어야.", layout: "검색+목록 또는 카테고리 인덱스" },
              ].map((s) => (
                <div key={s.screen} className="grid grid-cols-3 gap-2 p-3 rounded-lg text-xs" style={{ background: theme.primaryLight }}>
                  <span className="font-black" style={{ color: P }}>{s.screen}</span>
                  <span className="text-muted-foreground">{s.idea}</span>
                  <span className="text-muted-foreground font-mono">{s.layout}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Consistency ── */}
        <Section id="일관성" tier="—" title="일관성의 정의" primary={P}
          sub="동일한 레이아웃이 아니라, 동일한 언어로 말하는 것">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="p-5 rounded-xl border border-red-100 bg-red-50">
              <p className="text-xs font-black text-red-600 mb-3">일관성이 아닌 것</p>
              <ul className="space-y-2 text-xs text-red-700">
                {["모든 페이지가 동일한 card 구조", "모든 섹션에 rounded-2xl 사용", "Hero는 항상 gradient + 중앙 정렬", "모든 section이 비슷한 높이"].map((i) => (
                  <li key={i} className="flex gap-2"><XCircle size={11} className="shrink-0 mt-0.5" /> {i}</li>
                ))}
              </ul>
            </div>
            <div className="p-5 rounded-xl border border-emerald-100 bg-emerald-50">
              <p className="text-xs font-black text-emerald-700 mb-3">일관성을 만드는 것</p>
              <ul className="space-y-2 text-xs text-emerald-800">
                {["Typography (같은 폰트, hierarchy 규칙)", "Color semantics (Safe/Caution/Danger 의미)", "Spacing rhythm", "Interaction behavior", "Brand tone"].map((i) => (
                  <li key={i} className="flex gap-2"><CheckCircle2 size={11} className="shrink-0 mt-0.5" /> {i}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ── Design Decision ── */}
        <Section id="design-decision" tier="—" title="Design Decision 원칙" primary={P}
          sub="모든 시각적 결정에는 구체적인 이유가 있어야 합니다.">
          <div className="p-5 bg-white rounded-xl border mb-5" style={{ borderColor: theme.border }}>
            <p className="text-sm font-black mb-4 text-center">이 요소가 무엇을 개선하는가?</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
              {["Comprehension", "Hierarchy", "Interaction", "Scanability", "Semantic meaning", "Brand identity"].map((q) => (
                <div key={q} className="p-2.5 rounded-lg text-xs font-medium text-center" style={{ background: theme.primaryLight, color: P }}>{q}</div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">아무것도 개선하지 않는다면 추가하지 마세요.</p>
          </div>

          <div className="p-5 rounded-xl border" style={{ background: theme.primaryLight, borderColor: `${P}30` }}>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={16} style={{ color: P }} />
              <p className="text-sm font-black">이 Design System의 최종 조건</p>
            </div>
            <div className="space-y-2">
              {[
                "브랜드와 UX에는 강한 일관성이 있다.",
                "특정 layout이나 visual style을 강요하지 않는다.",
                "새로운 화면을 만들 때마다 서로 다른 composition을 시도할 수 있다.",
                "AI-generated SaaS template 느낌으로 자동 수렴하지 않는다.",
                "개발자가 실제 React UI로 구현할 수 있을 만큼 명확하다.",
                "이 가이드 자체가 또 하나의 고정적인 AI 디자인 스타일이 되지 않는다.",
              ].map((c, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <span className="font-black shrink-0" style={{ color: P }}>{i + 1}.</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

      </main>
    </div>
  );
}
