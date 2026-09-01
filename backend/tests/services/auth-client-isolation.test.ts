import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 로그인이 `adminClient()` 를 오염시키지 못하게 지킨다.
 *
 * 왜 이 테스트가 있는가: `signIn` 이 캐시된 `adminClient()` 로
 * `signInWithPassword` 를 부르고 있었다. supabase-js 는 요청마다
 * `세션 토큰 ?? supabaseKey` 순으로 인증 헤더를 고르기 때문에, 로그인 성공 순간부터
 * 그 공유 클라이언트는 service_role 이 아니라 **방금 로그인한 사용자**가 된다.
 * 결과적으로 누군가 로그인하면 그 뒤 모든 사용자의 문서 업로드가
 * "new row violates row-level security policy" 로 깨졌고, 서버를 재시작하기 전까지
 * 낫지 않았다. 증상이 로그인과 전혀 달라 보여서 원인을 찾는 데 오래 걸렸다.
 *
 * 실제 Supabase 없이 확인해야 하므로 소스에서 호출 형태를 본다.
 */
describe("로그인 클라이언트 격리", () => {
  const source = readFileSync(
    new URL("../../src/services/auth.service.ts", import.meta.url),
    "utf-8",
  );

  it("signInWithPassword 를 공유 adminClient 로 부르지 않는다", () => {
    expect(source).not.toMatch(/admin\s*\.auth\s*\.signInWithPassword/);
    expect(source).toContain("passwordAuthClient().auth.signInWithPassword");
  });

  it("passwordAuthClient 는 인스턴스를 캐시하지 않는다", () => {
    const supabase = readFileSync(
      new URL("../../src/lib/supabase.ts", import.meta.url),
      "utf-8",
    );
    const body = supabase.slice(
      supabase.indexOf("export function passwordAuthClient"),
      supabase.indexOf("export function userClient"),
    );
    expect(body).toContain("createClient(");
    // 캐시하면 세션이 남아 같은 문제가 재발한다.
    expect(body).not.toMatch(/if\s*\(\s*\w+\s*\)\s*return/);
  });
});
