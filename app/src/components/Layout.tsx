import { Link, Outlet, useLocation } from "react-router";
import mainImage from "@/assets/MainImage.jpg";

const NAV_ITEMS = [
  { label: "등기부 분석", to: "/analyze" },
  { label: "계약 체크리스트", to: "/checklist" },
  { label: "용어사전", to: "/glossary" },
  { label: "리포트 예시", to: "/analyze/result" },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-9 px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={mainImage} alt="Zip042" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
            <span className="font-display text-xl font-black tracking-tight text-brand-primary">
              Zip042
            </span>
          </Link>
          <nav className="flex gap-6 text-sm font-medium text-muted-foreground">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={isActive ? "font-bold text-foreground" : "hover:text-foreground"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" className="text-sm text-muted-foreground-light">
              로그인
            </button>
            <Link
              to="/analyze"
              className="rounded-[10px] bg-brand-primary px-[18px] py-[9px] text-sm font-bold text-white hover:bg-brand-primary-hover"
            >
              무료로 확인하기
            </Link>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-border bg-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-8 py-8">
          <span className="font-display text-base font-black text-brand-primary">Zip042</span>
          <p className="text-xs leading-relaxed text-muted-foreground-light">
            본 서비스는 등기부 기재사항을 기준으로 한 참고 정보를 제공하며, 법률 자문이나 중개 행위가 아닙니다.
          </p>
          <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground-light">
            디자인 프로토타입 v0.1
          </span>
        </div>
      </footer>
    </div>
  );
}
