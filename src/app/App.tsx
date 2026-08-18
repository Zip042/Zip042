import { useState } from "react";
import {
  ShieldCheck, AlertTriangle, XCircle, CheckCircle2,
  Upload, ChevronRight, ChevronDown, Bell, User,
  FileText, Search, BookOpen, Lock, Zap, Copy, Check
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   등기지킴이 — Design Guide v0.1
   대상: 사회초년생 원룸 계약 안전 검사 서비스
   작성: 2026.08.18
══════════════════════════════════════════════════════ */

const PINK = "#ff3b6b";

// ── Utilities ─────────────────────────────────────────
function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 mb-20">
      <div className="mb-8 pb-4 border-b-2 border-border">
        <p className="text-[11px] font-black tracking-widest uppercase mb-1" style={{ color: PINK }}>
          {id.toUpperCase()}
        </p>
        <h2 className="text-2xl font-black">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Token({ name, value, swatch }: { name: string; value: string; swatch?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-border hover:border-primary/40 transition-colors group">
      {swatch && (
        <div className="w-8 h-8 rounded-lg shrink-0 border border-black/10" style={{ background: swatch }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">{value}</p>
      </div>
      <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary">
        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="text-muted-foreground" />}
      </button>
    </div>
  );
}

function Chip({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-border text-sm">
      <span className="font-bold">{label}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

function GuideLabel({ text }: { text: string }) {
  return (
    <div className="absolute -top-3 left-3 z-10">
      <span className="text-[10px] font-black bg-primary text-primary-foreground px-2 py-0.5 rounded-full" style={{ background: PINK }}>
        {text}
      </span>
    </div>
  );
}

function Annotated({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative pt-4 border border-dashed border-pink-200 rounded-2xl p-4">
      <GuideLabel text={label} />
      {children}
    </div>
  );
}

const navItems = ["등기부 분석", "계약 가이드", "용어 사전", "커뮤니티"];

export default function App() {
  const [activeTx, setActiveTx] = useState("매매");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeCheck, setActiveCheck] = useState("계약 전");
  const [activeNav, setActiveNav] = useState("색상");

  const sideNav = ["색상", "타이포그래피", "간격·반경", "컴포넌트", "레이아웃", "섹션별 가이드", "상태 표현"];

  return (
    <div className="min-h-screen bg-background text-foreground flex" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-0 h-screen border-r border-border bg-white overflow-y-auto">
        <div className="p-5 border-b border-border">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-0.5">Design Guide</p>
          <p className="font-black text-base" style={{ color: PINK }}>등기지킴이</p>
          <p className="text-[10px] text-muted-foreground">v0.1 · 2026.08.18</p>
        </div>
        <nav className="p-3 flex flex-col gap-0.5">
          {sideNav.map((item) => (
            <a
              key={item}
              href={`#${item}`}
              onClick={() => setActiveNav(item)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeNav === item
                  ? "bg-secondary text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="mt-auto p-4 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            이 가이드는 개발 전 디자인 레퍼런스입니다. 실제 구현 시 이 가이드를 기준으로 컴포넌트를 작성해주세요.
          </p>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 min-w-0 px-6 md:px-10 py-10 max-w-4xl">

        {/* Page header */}
        <div className="mb-14 pb-8 border-b border-border">
          <div className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full mb-4" style={{ background: "#ffe8ee", color: PINK }}>
            디자인 가이드 문서
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-3" style={{ fontFamily: "'Nunito', 'Noto Sans KR', sans-serif" }}>
            등기지킴이<br />Design Guide
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg">
            사회초년생을 위한 원룸 계약 안전 검사 서비스의 디자인 시스템입니다.
            어떤 섹션에 어떤 컴포넌트와 색상을 사용할지 정의합니다.
          </p>
          <div className="flex flex-wrap gap-3 mt-5 text-xs">
            {[
              { label: "메인 컬러", value: "#FF3B6B · Hot Pink" },
              { label: "배경", value: "#FFF5F7 · Blush White" },
              { label: "폰트", value: "Nunito + Noto Sans KR" },
              { label: "라디우스", value: "1rem (기본)" },
            ].map((t) => (
              <div key={t.label} className="bg-white border border-border px-3 py-1.5 rounded-full">
                <span className="text-muted-foreground">{t.label}: </span>
                <span className="font-bold">{t.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 1. COLOR ── */}
        <Section id="색상" title="색상 팔레트" sub="서비스 전반에 사용하는 컬러 토큰 정의">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Brand */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Brand</p>
              <div className="space-y-2">
                <Token name="Primary · --primary" value="#FF3B6B" swatch="#FF3B6B" />
                <Token name="Primary Hover" value="#E8305C" swatch="#E8305C" />
                <Token name="Primary Light · --secondary" value="#FFE8EE" swatch="#FFE8EE" />
                <Token name="Primary Foreground" value="#FFFFFF" swatch="#FFFFFF" />
              </div>
            </div>
            {/* Neutral */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Neutral</p>
              <div className="space-y-2">
                <Token name="Background · --background" value="#FFF5F7" swatch="#FFF5F7" />
                <Token name="Card · --card" value="#FFFFFF" swatch="#FFFFFF" />
                <Token name="Foreground · --foreground" value="#1A1020" swatch="#1A1020" />
                <Token name="Muted FG · --muted-foreground" value="#A07080" swatch="#A07080" />
                <Token name="Border · --border" value="rgba(255,59,107,0.12)" swatch="rgba(255,59,107,0.12)" />
              </div>
            </div>
          </div>

          {/* Status colors */}
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">상태 색상 (분석 결과 전용)</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: "Safe · 안전",    bg: "#ECFDF5", border: "#A7F3D0", text: "#059669", badge: "bg-emerald-100 text-emerald-700" },
              { name: "Caution · 주의", bg: "#FFFBEB", border: "#FDE68A", text: "#D97706", badge: "bg-amber-100 text-amber-700" },
              { name: "Danger · 위험",  bg: "#FEF2F2", border: "#FECACA", text: "#EF4444", badge: "bg-red-100 text-red-600" },
            ].map((s) => (
              <div key={s.name} className="rounded-2xl border p-4 text-center" style={{ background: s.bg, borderColor: s.border }}>
                <p className="text-xs font-black mb-2" style={{ color: s.text }}>{s.name}</p>
                <div className="space-y-1 text-[10px]">
                  <div className="font-mono" style={{ color: s.text }}>bg: {s.bg}</div>
                  <div className="font-mono" style={{ color: s.text }}>border: {s.border}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Usage rule */}
          <div className="mt-6 p-4 rounded-2xl bg-white border border-border">
            <p className="text-xs font-black mb-3">색상 사용 원칙</p>
            <div className="space-y-2 text-xs text-muted-foreground">
              {[
                "Primary(#FF3B6B)는 CTA 버튼, 링크, 강조 텍스트에만 사용. 너무 많이 쓰면 희석됨.",
                "배경은 항상 #FFF5F7 또는 #FFFFFF 두 가지만. 다른 배경색 사용 금지.",
                "상태 색상(Safe/Caution/Danger)은 분석 결과 섹션에서만 사용. 다른 곳에 혼용 금지.",
                "텍스트에 Primary 색상 직접 사용 시 반드시 배경과 4.5:1 대비 확인.",
              ].map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 font-black" style={{ color: PINK }}>{i + 1}.</span>
                  {r}
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── 2. TYPOGRAPHY ── */}
        <Section id="타이포그래피" title="타이포그래피" sub="폰트 패밀리, 사이즈, 웨이트 체계">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-2xl border border-border p-6">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-4">Display Font</p>
              <p className="text-4xl font-black mb-1" style={{ fontFamily: "'Nunito', sans-serif", color: PINK }}>Nunito</p>
              <p className="text-sm text-muted-foreground mb-4">히어로 제목, 서비스명, 핵심 강조 문구</p>
              <p className="text-2xl font-black" style={{ fontFamily: "'Nunito', sans-serif" }}>원룸 계약,<br />이제 안전하게</p>
              <p className="text-xs text-muted-foreground mt-3 font-mono">font-black · 700~900 weight</p>
            </div>
            <div className="bg-white rounded-2xl border border-border p-6">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-4">Body Font</p>
              <p className="text-3xl font-bold mb-1" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>Noto Sans KR</p>
              <p className="text-sm text-muted-foreground mb-4">본문, UI 레이블, 설명 텍스트 전반</p>
              <p className="text-sm leading-relaxed">등기부등본 PDF를 올리면 30초 안에 근저당, 압류, 경매 위험 여부를 자동으로 분석해드려요.</p>
              <p className="text-xs text-muted-foreground mt-3 font-mono">400 · 500 · 700 · 900 weight</p>
            </div>
          </div>

          {/* Type scale */}
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">타입 스케일</p>
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            {[
              { name: "Display · Hero H1",    size: "text-4xl md:text-5xl", weight: "font-black", sample: "내 집 마련의 시작", font: "Nunito", use: "히어로 섹션 메인 제목" },
              { name: "H2 · Section Title",   size: "text-2xl md:text-3xl", weight: "font-black", sample: "이런 것들을 검사해요", font: "Nunito / Noto", use: "섹션 타이틀" },
              { name: "H3 · Card Title",      size: "text-base",            weight: "font-black", sample: "근저당권 검사", font: "Noto Sans KR", use: "카드 제목, 항목명" },
              { name: "Body · Default",       size: "text-sm",              weight: "font-normal", sample: "등기부등본을 발급받아 업로드하면 자동으로 분석해드려요.", font: "Noto Sans KR", use: "본문 설명" },
              { name: "Caption · Label",      size: "text-xs",              weight: "font-medium", sample: "분석 완료 · 2026.08.18", font: "Noto Sans KR", use: "보조 텍스트, 날짜, 태그" },
              { name: "Micro",                size: "text-[10px]",          weight: "font-bold",   sample: "SAFE · 안전", font: "Noto Sans KR", use: "뱃지, 라벨" },
            ].map((t, i) => (
              <div key={i} className={`flex items-center gap-4 px-5 py-4 ${i % 2 === 1 ? "bg-background" : ""} border-b border-border last:border-0`}>
                <div className="w-36 shrink-0">
                  <p className="text-[10px] font-black text-muted-foreground">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{t.size}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`${t.size} ${t.weight} truncate`} style={{ fontFamily: t.font.includes("Nunito") ? "'Nunito', sans-serif" : undefined }}>
                    {t.sample}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground shrink-0 hidden md:block">{t.use}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 3. SPACING & RADIUS ── */}
        <Section id="간격·반경" title="간격 & 반경" sub="일관된 여백과 둥근 모서리 체계">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Radius */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Border Radius</p>
              <div className="space-y-3">
                {[
                  { name: "rounded-full",  px: "9999px", use: "알약형 버튼, 태그, 뱃지" },
                  { name: "rounded-3xl",   px: "24px",   use: "히어로 업로드 카드, CTA 배너" },
                  { name: "rounded-2xl",   px: "16px",   use: "일반 카드, 결과 카드, FAQ" },
                  { name: "rounded-xl",    px: "12px",   use: "인풋, 소형 카드, 리스트 아이템" },
                  { name: "rounded-lg",    px: "8px",    use: "뱃지 내부 요소, 썸네일" },
                ].map((r) => (
                  <div key={r.name} className="flex items-center gap-4 p-3 bg-white rounded-xl border border-border">
                    <div
                      className="w-10 h-10 bg-secondary border-2 shrink-0"
                      style={{ borderColor: PINK, borderRadius: r.px }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black font-mono">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.px} · {r.use}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Spacing */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Spacing Scale</p>
              <div className="space-y-2">
                {[
                  { token: "p-3 / gap-3",    px: "12px", use: "인풋 내부, 소형 카드 패딩" },
                  { token: "p-4 / gap-4",    px: "16px", use: "카드 기본 패딩, 리스트 간격" },
                  { token: "p-5 / gap-5",    px: "20px", use: "섹션 내 요소 간격" },
                  { token: "p-6 / gap-6",    px: "24px", use: "카드 표준 패딩" },
                  { token: "p-10 / gap-10",  px: "40px", use: "CTA 배너 패딩" },
                  { token: "mb-8 / mb-10",   px: "32~40px", use: "섹션 타이틀 하단 여백" },
                  { token: "mb-16 / mb-20",  px: "64~80px", use: "섹션 간 여백" },
                ].map((s) => (
                  <div key={s.token} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-border">
                    <div className="flex items-end gap-0.5 shrink-0">
                      <div className="bg-primary/20 rounded" style={{ width: parseInt(s.px) / 4, height: 20, background: "#ffe8ee", border: `1px solid ${PINK}` }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black font-mono">{s.token}</p>
                      <p className="text-[10px] text-muted-foreground">{s.px} · {s.use}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── 4. COMPONENTS ── */}
        <Section id="컴포넌트" title="컴포넌트" sub="서비스에서 반복 사용하는 UI 요소 정의">

          {/* Buttons */}
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">버튼</p>
            <div className="bg-white rounded-2xl border border-border p-6">
              <div className="flex flex-wrap gap-3 mb-4">
                <button className="px-6 py-3 rounded-2xl text-sm font-black text-white" style={{ background: PINK }}>
                  Primary · 무료 분석 시작
                </button>
                <button className="px-6 py-3 rounded-2xl text-sm font-black border-2 border-primary text-primary hover:bg-secondary transition-colors">
                  Secondary · 계약 가이드
                </button>
                <button className="px-6 py-3 rounded-2xl text-sm font-bold border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  Ghost · 더 알아보기
                </button>
                <button className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: PINK }}>
                  Pill · 로그인
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <Chip label="Primary" note="CTA, 핵심 행동 유도. 1페이지 1~2개 이하" />
                <Chip label="Secondary" note="보조 행동. Primary 옆에 배치 시 사용" />
                <Chip label="Ghost" note="3순위 액션, 네비게이션 링크" />
                <Chip label="Pill" note="네비게이션 바, 태그형 필터 버튼" />
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">상태 뱃지 (분석 결과)</p>
            <div className="bg-white rounded-2xl border border-border p-6">
              <div className="flex flex-wrap gap-3 mb-5">
                {[
                  { label: "안전", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
                  { label: "주의", cls: "bg-amber-100 text-amber-700",    icon: AlertTriangle },
                  { label: "위험", cls: "bg-red-100 text-red-600",         icon: XCircle },
                ].map(({ label, cls, icon: Icon }) => (
                  <span key={label} className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full ${cls}`}>
                    <Icon size={12} /> {label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full" style={{ background: "#ffe8ee", color: PINK }}>
                  급매
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-violet-100 text-violet-700">
                  신축
                </span>
              </div>
              <p className="text-xs text-muted-foreground">분석 결과의 Safe/Caution/Danger 뱃지는 반드시 아이콘 함께 사용. 색상만으로 상태를 전달하지 않을 것.</p>
            </div>
          </div>

          {/* Input */}
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">입력 필드</p>
            <div className="bg-white rounded-2xl border border-border p-6 space-y-3">
              <div className="flex bg-white rounded-2xl overflow-hidden border border-border shadow-sm">
                <div className="flex items-center pl-4 text-muted-foreground"><Search size={16} style={{ color: PINK }} /></div>
                <input placeholder="지역, 단지명, 도로명 주소 검색" className="flex-1 px-3 py-3.5 text-sm outline-none bg-transparent placeholder:text-muted-foreground" />
                <button className="m-1.5 px-5 rounded-xl text-sm font-black text-white" style={{ background: PINK }}>검색</button>
              </div>
              <input placeholder="일반 인풋 · 고유번호(부동산 소재지) 입력" className="w-full px-4 py-3 rounded-xl border border-border text-sm outline-none focus:border-primary transition-colors bg-white" />
              <p className="text-xs text-muted-foreground">검색바: rounded-2xl + 내부 버튼 / 일반 인풋: rounded-xl + border focus</p>
            </div>
          </div>

          {/* Cards */}
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">카드</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Annotated label="Step 카드">
                <div className="bg-white rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-black" style={{ color: PINK }}>01</span>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#ffe8ee" }}>
                      <FileText size={18} style={{ color: PINK }} />
                    </div>
                  </div>
                  <p className="font-black text-sm mb-1">등기부등본 업로드</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">정부24에서 발급한 PDF를 올려주세요.</p>
                </div>
              </Annotated>

              <Annotated label="결과 아이템 카드">
                <div className="flex items-start gap-3 p-4 rounded-xl border bg-red-50 border-red-100">
                  <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-black">근저당권</p>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">위험</span>
                    </div>
                    <p className="text-xs text-muted-foreground">채권최고액 1억 2천만원 설정.</p>
                  </div>
                </div>
              </Annotated>

              <Annotated label="정보 카드">
                <div className="bg-white rounded-2xl border border-border p-5">
                  <p className="text-3xl mb-2">🏦</p>
                  <p className="font-black text-sm mb-1">근저당권</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">집을 담보로 빌린 돈에 대한 권리. 채권최고액이 크면 위험해요.</p>
                </div>
              </Annotated>
            </div>
          </div>

          {/* Upload zone */}
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">업로드 영역</p>
            <Annotated label="파일 드롭존">
              <div className="bg-white rounded-2xl p-4">
                <div className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary transition-colors" style={{ borderColor: "#ffb3c6" }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#ffe8ee" }}>
                    <Upload size={22} style={{ color: PINK }} />
                  </div>
                  <p className="font-black text-sm">등기부등본 PDF 업로드</p>
                  <p className="text-xs text-muted-foreground text-center">클릭하거나 파일을 여기로 끌어다 놓으세요</p>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-3">
                  <Lock size={10} className="inline mr-1" />파일은 분석 후 즉시 삭제
                </p>
              </div>
            </Annotated>
          </div>

          {/* Accordion */}
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">아코디언 (FAQ)</p>
            <div className="space-y-2">
              {[
                { q: "등기부등본은 어디서 발급해요?", a: "정부24(gov.kr) 또는 인터넷등기소(iros.go.kr)에서 700원에 발급할 수 있어요." },
                { q: "근저당이 있으면 무조건 위험한가요?", a: null },
              ].map((f, i) => (
                <div key={i} className="bg-white rounded-2xl border border-border overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                    <span className="text-sm font-bold">{f.q}</span>
                    <ChevronDown size={15} className={`text-muted-foreground transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === i && f.a && (
                    <div className="px-5 pb-4">
                      <p className="text-sm text-muted-foreground">{f.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── 5. LAYOUT ── */}
        <Section id="레이아웃" title="레이아웃 시스템" sub="페이지 구조와 그리드 정의">
          <div className="space-y-5">
            {[
              { label: "최대 너비",       value: "max-w-5xl (1024px)",    note: "콘텐츠 컨테이너 상한. 더 넓으면 집중도 떨어짐." },
              { label: "사이드 패딩",     value: "px-5 (20px)",           note: "모바일/태블릿. 데스크탑은 px-10." },
              { label: "섹션 간격",       value: "mb-20 (80px)",          note: "주요 섹션 사이. 압박감 없이 호흡을 줌." },
              { label: "카드 그리드",     value: "grid-cols-1 → md:2 → lg:3", note: "1열(모바일) → 2열(태블릿) → 3열(데스크탑) 반응형." },
              { label: "분석 결과 레이아웃", value: "단일 풀너비 카드",   note: "결과는 분산하지 않고 하나의 카드에 집중." },
              { label: "히어로 정렬",     value: "text-center + max-w-3xl", note: "중앙 정렬로 업로드 행동에 집중 유도." },
            ].map((l) => (
              <div key={l.label} className="flex items-start gap-4 p-4 bg-white rounded-xl border border-border">
                <div className="w-36 shrink-0">
                  <p className="text-xs font-black">{l.label}</p>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-mono font-bold mb-0.5">{l.value}</p>
                  <p className="text-xs text-muted-foreground">{l.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 6. SECTION GUIDE ── */}
        <Section id="섹션별 가이드" title="섹션별 디자인 가이드" sub="각 페이지 섹션에서 무엇을 어떻게 쓸지 정의">
          <div className="space-y-6">
            {[
              {
                section: "GNB (네비게이션)",
                bg: "bg-white/90 backdrop-blur",
                layout: "sticky top-0, h-16, flex justify-between",
                typo: "서비스명: Nunito font-black text-xl · 메뉴: text-sm font-medium",
                components: ["텍스트 링크 (hover: text-primary)", "Bell 아이콘 + 빨간 점 알림", "Pill 버튼 (로그인)"],
                color: "배경 white/90, 서비스명 #FF3B6B, 메뉴 muted-foreground",
                note: "스크롤 시 blur 효과. 항상 최상단 고정.",
              },
              {
                section: "Hero 섹션",
                bg: "Pink Gradient (135deg, #FF3B6B → #FFB3C6)",
                layout: "text-center, max-w-3xl mx-auto, pt-16 pb-20",
                typo: "H1: Nunito font-black text-4xl~5xl white · 부제: text-sm white/75",
                components: ["Badge 라벨 (bg-white/20)", "매매/전세/월세 토글 탭", "검색바 (rounded-2xl, 내부 핑크 버튼)", "유형 필터 Pill 버튼"],
                color: "텍스트 white, 버튼 white배경 + #FF3B6B 텍스트 (선택), white/15 + white 텍스트 (미선택)",
                note: "배경의 Decorative blob은 white opacity-15. 히어로 = 업로드 CTA가 핵심.",
              },
              {
                section: "업로드 카드 (히어로 내)",
                bg: "bg-white, rounded-3xl, shadow-xl shadow-pink-900/20",
                layout: "max-w-md mx-auto, p-6~8",
                typo: "안내: text-sm font-black · 보조: text-xs text-muted",
                components: ["Dashed Drop Zone (border-pink-300)", "텍스트 인풋 (고유번호 열람)", "Primary 버튼 (w-full)", "Lock 아이콘 보안 문구"],
                color: "Drop zone border: #FFB3C6 dashed / 아이콘 bg: #FFE8EE",
                note: "로딩 시: 핑크 스피너 + 진행 텍스트. 결과 시: 분석 결과 인라인 표시.",
              },
              {
                section: "이용 방법 (How it works)",
                bg: "bg-background",
                layout: "grid grid-cols-1 md:grid-cols-3 gap-6",
                typo: "스텝 번호: text-xs font-black #FF3B6B · 제목: font-black text-base · 설명: text-sm text-muted",
                components: ["Step 번호 + 아이콘 (bg-secondary 원형)", "화살표 구분자 (→ 데스크탑만)", "Step 카드 (bg-white rounded-3xl)"],
                color: "카드 bg: white / 아이콘 컨테이너: #FFE8EE",
                note: "3단계 이상 넘지 말 것. 사용자가 복잡하다고 느끼면 이탈.",
              },
              {
                section: "분석 결과 카드",
                bg: "bg-white, rounded-3xl, border border-border",
                layout: "단일 풀너비 카드, 내부: header / score bar / item list / action footer",
                typo: "섹션 레이블: text-[10px] font-black / 아이템 제목: text-sm font-bold / 설명: text-xs text-muted",
                components: ["종합 판정 뱃지 (Safe/Caution/Danger)", "위험도 점수 바 (h-3 gradient)", "아이템 행 (아이콘 + 텍스트 + 상태 뱃지)", "액션 푸터 (버튼 2개)"],
                color: "Danger 행: bg-red-50/50 · Safe 행: 기본 white · 뱃지: 상태별 색상 시스템 적용",
                note: "위험 항목은 상단에 우선 표시. 안전 항목은 하단.",
              },
              {
                section: "체크리스트 섹션",
                bg: "bg-white, rounded-3xl",
                layout: "탭 헤더 + 탭 콘텐츠",
                typo: "탭 레이블: text-sm font-bold / 아이템: text-sm / TIP: text-xs",
                components: ["탭 (border-b-2 border-primary on active)", "번호 버블 (w-6 h-6 rounded-full bg-primary)", "TIP 박스 (bg-#fff5f7)"],
                color: "활성 탭: text-primary + border-primary / 비활성: text-muted",
                note: "계약 전 → 계약 시 → 입주 후 순서 고정. 탭 순서 바꾸지 말 것.",
              },
              {
                section: "CTA 배너",
                bg: "Pink Gradient + 데코 blob",
                layout: "rounded-3xl p-10~12, text-center",
                typo: "H2: font-black text-2xl~3xl white / 부제: text-sm white/75 / 통계: text-sm font-bold white",
                components: ["Primary 버튼 (bg-white, text-primary)", "Secondary 버튼 (border-white/50)"],
                color: "배경: 히어로와 동일 핑크 그라디언트 사용 → 통일감",
                note: "페이지당 1개만. 스크롤 하단에 위치.",
              },
              {
                section: "Footer",
                bg: "bg-white, border-t border-border",
                layout: "grid grid-cols-2 md:grid-cols-4 + 하단 copyright",
                typo: "서비스명: font-black #FF3B6B / 섹션 헤딩: text-xs font-black uppercase tracking-widest / 링크: text-xs text-muted",
                components: ["서비스명 (Nunito)", "링크 목록 (hover: text-primary)", "외부 링크 버튼 (border rounded-lg)"],
                color: "배경 white, 링크 muted → primary on hover",
                note: "법적 고지 문구 반드시 포함: '법률 조언을 대체하지 않음'",
              },
            ].map((s) => (
              <div key={s.section} className="bg-white rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-border" style={{ background: "#fff5f7" }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PINK }} />
                  <p className="font-black text-sm">{s.section}</p>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div><span className="font-black text-muted-foreground">배경/컨테이너 </span><span className="font-mono">{s.bg}</span></div>
                    <div><span className="font-black text-muted-foreground">레이아웃 </span><span className="font-mono">{s.layout}</span></div>
                    <div><span className="font-black text-muted-foreground">타이포 </span>{s.typo}</div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="font-black text-muted-foreground block mb-1">사용 컴포넌트</span>
                      <div className="flex flex-wrap gap-1">
                        {s.components.map((c) => (
                          <span key={c} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-foreground">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div><span className="font-black text-muted-foreground">색상 </span>{s.color}</div>
                    <div className="p-2 rounded-lg" style={{ background: "#fff5f7" }}>
                      <span className="font-black" style={{ color: PINK }}>Note: </span>{s.note}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 7. STATE ── */}
        <Section id="상태 표현" title="상태 표현" sub="로딩, 에러, 빈 상태, 성공 패턴">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Annotated label="로딩 (분석 중)">
              <div className="bg-white rounded-2xl border border-border p-8 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full border-4 border-secondary border-t-primary animate-spin" style={{ borderTopColor: PINK }} />
                <p className="font-bold text-sm">등기부등본 분석 중…</p>
                <p className="text-xs text-muted-foreground text-center">10가지 항목 검사 중이에요</p>
              </div>
            </Annotated>

            <Annotated label="에러 상태">
              <div className="bg-white rounded-2xl border border-red-100 p-8 flex flex-col items-center gap-3">
                <XCircle size={32} className="text-red-400" />
                <p className="font-bold text-sm text-red-600">파일을 읽을 수 없어요</p>
                <p className="text-xs text-muted-foreground text-center">정부24에서 발급한 PDF인지 확인해주세요.</p>
                <button className="text-xs font-bold px-4 py-2 rounded-xl border-2 border-primary text-primary">
                  다시 업로드
                </button>
              </div>
            </Annotated>

            <Annotated label="위험 판정">
              <div className="bg-red-50 rounded-2xl border border-red-100 p-5 flex gap-4 items-start">
                <XCircle size={24} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-sm text-red-600 mb-1">계약 중단을 권고해요</p>
                  <p className="text-xs text-muted-foreground">경매 개시 등기 발견. 보증금 회수가 불가능할 수 있어요.</p>
                </div>
              </div>
            </Annotated>

            <Annotated label="안전 판정">
              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5 flex gap-4 items-start">
                <CheckCircle2 size={24} className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-sm text-emerald-700 mb-1">비교적 안전한 매물이에요</p>
                  <p className="text-xs text-muted-foreground">위험 항목 없음. 전입신고와 확정일자는 입주 당일 꼭 받으세요.</p>
                </div>
              </div>
            </Annotated>
          </div>
        </Section>

      </main>
    </div>
  );
}
