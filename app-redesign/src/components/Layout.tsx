import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/state/auth";

const NAV = [
  { to: "/analyze", label: "계약 검사" },
  { to: "/checklist", label: "체크리스트" },
  { to: "/glossary", label: "용어사전" },
];

export default function Layout() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { email, signOut } = useAuth();
  const onHome = pathname === "/";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-6 px-6 lg:px-12">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Zip042" className="size-7 shrink-0 rounded-lg" />
            <span className="text-[17px] font-bold tracking-[-0.02em]">Zip042</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-[14px] font-medium transition-colors ${
                    isActive ? "text-brand-700" : "text-ink-500 hover:text-ink-900"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className={`flex items-center gap-3 ${onHome ? "ml-auto" : ""}`}>
            {email ? (
              <button
                onClick={() => {
                  signOut();
                  nav("/");
                }}
                className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-500 hover:bg-surface hover:text-ink-900"
                title="로그아웃"
              >
                <span className="max-w-[140px] truncate">{email}</span>
                <LogOut className="size-3.5 shrink-0 text-ink-300 group-hover:text-ink-500" />
              </button>
            ) : (
              <Link
                to="/login"
                className="text-[13.5px] font-medium text-ink-500 hover:text-ink-900"
              >
                로그인
              </Link>
            )}

            {!onHome && (
              <Link
                to="/analyze"
                className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3.5 text-[13px] font-semibold text-white hover:bg-brand-600"
              >
                검사 시작
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-24 border-t border-line">
        <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-12">
          <p className="text-[12.5px] leading-relaxed text-ink-300">
            Zip042의 판정은 참고용 점검이며 법률 자문이 아닙니다. 최종 판단 전 전문가와 상담하세요.
          </p>
          <p className="mt-2 text-[12px] text-ink-300">대전대학교 Campus AX-TON · 깡통방위대</p>
        </div>
      </footer>

      {/* 모바일 하단 내비 */}
      <nav className="sticky bottom-0 z-40 flex border-t border-line bg-white/95 backdrop-blur sm:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-[12px] font-medium ${
                isActive ? "text-brand-700" : "text-ink-300"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
