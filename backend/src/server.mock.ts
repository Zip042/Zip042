/**
 * 목 모드 진입점.
 *
 * ## 왜 별도 파일인가
 *
 * 원래는 npm 스크립트에서 `ZIP042_MODE=mock tsx watch src/server.ts` 로 넘겼는데,
 * 그 문법은 **POSIX 셸 전용이라 Windows 에서 실행되지 않는다**(cmd.exe 가
 * `ZIP042_MODE` 를 명령어로 해석한다). 팀원의 OS 가 섞여 있으므로 `cross-env` 같은
 * 의존성을 추가하거나 파일을 하나 두는 두 방법 중, 의존성 없는 쪽을 택했다.
 *
 * `??=` 인 이유: 셸에서 `ZIP042_MODE=live` 를 명시적으로 준 경우를 덮지 않는다.
 */
process.env.ZIP042_MODE ??= "mock";

await import("./server.js");
