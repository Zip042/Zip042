import { z } from "zod";

/**
 * 환경변수는 부팅 시 한 번 검증한다.
 * 필수 값이 빠지면 요청 처리 중이 아니라 부팅 시점에 죽는 편이 낫다.
 *
 * ## 실행 모드
 *
 *  - `live` : Supabase · Anthropic · 공공데이터포털을 실제로 호출한다.
 *  - `mock` : 외부 의존이 **전혀 없다**. in-memory 저장소와 고정 픅스처로 동작한다.
 *             프론트엔드가 API 키 없이 전체 흐름을 붙여볼 수 있게 하기 위한 모드다.
 *
 * ZIP042_MODE 를 지정하지 않으면 SUPABASE_URL 유무로 자동 판단한다
 * (키가 하나도 없는 상태에서 `npm run dev` 만 해도 목 모드로 뜬다).
 */
const MODES = ["live", "mock"] as const;
export type RunMode = (typeof MODES)[number];

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    /** 비우면 SUPABASE_URL 유무로 자동 결정된다. */
    ZIP042_MODE: z.enum(MODES).optional(),

    /**
     * 데모 배포 허용 플래그.
     *
     * 기본적으로 `NODE_ENV=production` + 목 모드는 **부팅이 차단**된다. 실데이터 없이
     * 그럴듯한 응답을 내보내는 사고를 막기 위한 장치다(아래 superRefine 참고).
     *
     * 팀에게 보여주기 위한 배포처럼 **의도적으로** 목 데이터를 띄워야 할 때만 이 값을 켠다.
     * 켜면 서버가 스스로 데모임을 밝힌다:
     *   · 부팅 시 경고 로그
     *   · `GET /v1/meta` 의 `demo: true`
     *   · 모든 판정 응답 caveats 맨 앞에 데모 고지
     *
     * 실서비스에는 절대 켜지 말 것. 켠 채로 실키를 넣으면 고지만 붙고 동작은 live 다.
     */
    ZIP042_DEMO: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // Supabase — live 모드에서만 필수
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().min(20).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    /** Supabase 프로젝트의 JWT 시크릿 (HS256 검증용). 미설정 시 getUser() 원격 검증으로 폴백한다. */
    SUPABASE_JWT_SECRET: z.string().min(20).optional(),
    SUPABASE_STORAGE_BUCKET: z.string().default("case-documents"),

    // Anthropic
    ANTHROPIC_API_KEY: z.string().min(10).optional(),
    ANTHROPIC_MODEL: z.string().default("claude-opus-5"),
    /**
     * 문서 추출 시 추론 강도. 서류 판독은 정확도가 비용보다 중요하므로 기본 high.
     * ⚠️ 설치된 SDK(0.71.x)의 타입은 low|medium|high 만 허용한다. xhigh/max 를 쓰려면 SDK를 올려야 한다.
     */
    ANTHROPIC_EFFORT: z.enum(["low", "medium", "high"]).default("high"),

    // 공공데이터포털 (국토교통부 실거래가 등)
    DATA_GO_KR_SERVICE_KEY: z.string().optional(),
    DATA_GO_KR_BASE_URL: z.string().url().default("https://apis.data.go.kr"),

    // 한국천문연구원 특일 정보 (공휴일 동기화). 미설정 시 양력 고정 공휴일만 사용.
    KASI_SERVICE_KEY: z.string().optional(),

    /**
     * 주소 검색 · 지오코딩 제공자 키. 둘 중 하나만 있으면 되고, 없으면 목 데이터로 폴백한다.
     *
     * 여기에 선언해 두는 이유: 이 두 값만 `process.env` 에서 직접 읽으면 **오타를 낸 순간
     * 조용히 목 데이터로 폴백**한다 — 부팅도 요청도 실패하지 않으므로 원인을 찾기 어렵다.
     * 다른 키와 같은 검증 경로에 두어야 길이 미달 같은 실수가 부팅 시점에 드러난다.
     */
    KAKAO_REST_API_KEY: z.string().min(10).optional(),
    VWORLD_API_KEY: z.string().min(10).optional(),

    /** 지역 위험 레이어 반경 기본값(m). 기획서 2 ② "반경 500m". */
    REGION_RISK_RADIUS_M: z.coerce.number().int().positive().default(500),

    /** 관리자 배치 엔드포인트 보호용 공유 시크릿. */
    ADMIN_API_TOKEN: z.string().min(16).optional(),

    /**
     * 소유자 이름 매칭용 HMAC 페퍼.
     * 이름은 엔트로피가 낮아 단순 해시로는 역추적이 가능하다. 페퍼가 없으면
     * 동일 소유자 탐지 기능을 **비활성화**한다(원문 저장은 어떤 경우에도 하지 않는다).
     */
    MATCH_KEY_PEPPER: z.string().min(32).optional(),

    /** CORS 허용 오리진 (콤마 구분). 프론트엔드 개발 서버 주소를 넣는다. */
    CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),

    /** 목 모드의 서명 업로드 URL 이 가리킬 주소. 비우면 http://localhost:{PORT} */
    PUBLIC_BASE_URL: z.string().url().optional(),
  })
  .transform((v) => ({
    ...v,
    mode: (v.ZIP042_MODE ?? (v.SUPABASE_URL ? "live" : "mock")) as RunMode,
  }))
  .superRefine((v, ctx) => {
    if (v.mode === "mock") {
      // 목 모드가 운영 환경에 올라가면 실데이터 없이 그럴듯한 응답을 내보내게 된다. 부팅을 막는다.
      // ZIP042_DEMO=true 로 **의도를 명시**했을 때만 통과시킨다 — 그때는 서버가 스스로 데모임을 밝힌다.
      if (v.NODE_ENV === "production" && !v.ZIP042_DEMO) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ZIP042_MODE"],
          message:
            "운영 환경(NODE_ENV=production)에서는 목 모드로 실행할 수 없습니다. Supabase 설정을 채우거나, " +
            "팀 시연용 배포라면 ZIP042_DEMO=true 를 명시하세요(응답에 데모 고지가 붙습니다).",
        });
      }
      return;
    }

    for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
      if (!v[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `live 모드에서는 필수입니다. (목 모드로 실행하려면 ZIP042_MODE=mock)`,
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`환경변수 설정 오류:\n${detail}`);
  }
  cached = parsed.data;
  return cached;
}

export function isMockMode(): boolean {
  return loadEnv().mode === "mock";
}

/**
 * 목 데이터를 의도적으로 공개 배포한 상태인지.
 * 이 값이 true 면 응답이 실데이터가 아님을 사용자에게 반드시 알려야 한다.
 */
export function isDemoDeployment(): boolean {
  const env = loadEnv();
  return env.ZIP042_DEMO && env.mode === "mock";
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 테스트에서 캐시를 비우기 위한 훅. */
export function resetEnvCache(): void {
  cached = null;
}
