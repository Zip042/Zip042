import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `.env` 파일을 process.env 로 읽어들인다.
 *
 * ## 왜 직접 구현하는가
 *
 * Node 20.12+ 의 `process.loadEnvFile()` 이 dotenv 와 같은 일을 하므로 의존성을 늘리지 않는다.
 * `node --env-file` 플래그를 npm 스크립트에 박는 방법도 있지만, 그러면 tsx · vitest ·
 * 서버리스 진입점마다 플래그를 따로 관리해야 해서 빠뜨리기 쉽다. 코드에서 부르는 편이 낫다.
 *
 * ## 규칙
 *
 *  - **이미 설정된 환경변수를 덮어쓰지 않는다.** 플랫폼이 주입한 값(Vercel · CI · 셸 export)이
 *    항상 이긴다. 그래야 배포 환경에서 실수로 커밋된 `.env` 가 운영 설정을 덮는 사고가 없다.
 *  - **`.env` 파일의 `KEY=` (빈 값)은 "설정 안 함"으로 취급한다.** `.env.example` 을 복사해
 *    쓰는 흐름에서는 아직 안 채운 줄이 빈 문자열로 남는 것이 정상이다. `process.loadEnvFile`
 *    은 이걸 그대로 빈 문자열로 넣는데, zod 의 `.optional()` 은 `undefined` 만 건너뛰고
 *    빈 문자열은 값으로 보고 `.min()`·`.url()` 을 그대로 검사해 부팅이 막힌다.
 *    셸이 명시적으로 빈 문자열을 준 경우(`VAR=""`)는 건드리지 않는다 — 그건 사용자의 선택이다.
 *  - 파일이 없으면 조용히 넘어간다. 서버리스·CI 에는 `.env` 가 없는 것이 정상이다.
 *  - **진입점에서만** 부른다 (server.ts · scripts/*). 라이브러리 코드에서 부르면
 *    테스트가 개발자의 로컬 `.env` 에 따라 다르게 동작한다.
 */
export function loadDotEnv(fileName = ".env"): { loaded: boolean; path: string } {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return { loaded: false, path };

  // 파일에 있지만 이미 환경에 있는 키는 되돌려 놓기 위해 미리 스냅샷을 뜬다.
  // (loadEnvFile 은 무조건 덮어쓰므로 직접 되돌려야 한다.)
  const before = { ...process.env };

  try {
    process.loadEnvFile(path);
  } catch (err) {
    // 형식이 깨진 .env 로 서버가 죽는 것보다, 무엇이 문제인지 알리고 넘어가는 편이 낫다.
    // (필수 값이 비면 어차피 env.ts 의 검증이 부팅을 막는다.)
    console.error(
      `⚠️ ${fileName} 을 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { loaded: false, path };
  }

  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }

  // .env 에서만 온 빈 문자열은 "설정 안 함"으로 되돌린다 (before 에 없던 키만 — 셸이
  // 명시적으로 빈 문자열을 준 경우는 위 복원 루프가 이미 지켰으므로 여기 들어오지 않는다).
  for (const [key, value] of Object.entries(process.env)) {
    if (value === "" && before[key] === undefined) {
      delete process.env[key];
    }
  }

  return { loaded: true, path };
}
