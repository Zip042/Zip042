import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/state/auth";

/**
 * 검사 흐름은 사용자 소유 데이터(검사 건)를 다루므로 로그인이 있어야 합니다.
 * 홈·용어사전·체크리스트는 로그인 없이 봐도 되므로 여기서 감싸지 않습니다.
 */
export default function RequireAuth() {
  const { email } = useAuth();
  const location = useLocation();

  if (!email) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
