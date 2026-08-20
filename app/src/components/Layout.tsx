import { Link, Outlet, useLocation } from "react-router";

const NAV_ITEMS = [
  { label: "등기부 분석", to: "/analyze" },
  { label: "계약 체크리스트", to: "/checklist" },
  { label: "용어사전", to: "/glossary" },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="flex items-center gap-6 border-b border-border px-6 py-3">
        <Link to="/" className="font-display text-lg font-extrabold text-brand-primary">
          등기지킴이
        </Link>
        <nav className="flex gap-5 text-sm text-muted-foreground">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  isActive
                    ? "border-b-2 border-foreground pb-0.5 font-bold text-foreground"
                    : "hover:text-foreground"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className="ml-auto rounded-full border border-foreground px-4 py-1.5 text-sm"
        >
          로그인
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
