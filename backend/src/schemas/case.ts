import { z } from "zod";
import { isDateOnly } from "../lib/date.js";
import { MAN } from "../domain/money.js";

/**
 * 요청 스키마.
 *
 * 금액 단위 정책: 프론트엔드는 원(krw) 또는 만원(man) 중 하나로 보낼 수 있고,
 * `amountUnit` 으로 명시한다. 서버 내부에서는 **항상 원 단위 정수**로 정규화한다.
 * (만원/원을 섞어 쓰다가 100배 오차가 나는 사고를 스키마 단계에서 차단한다.)
 */

export const dateOnly = z
  .string()
  .refine(isDateOnly, { message: "YYYY-MM-DD 형식의 날짜여야 합니다." });

export const leaseTypeSchema = z.enum(["jeonse", "monthly", "semi_jeonse"]);

export const buildingTypeSchema = z.enum([
  "apartment",
  "officetel",
  "multi_family",
  "multi_household",
  "row_house",
  "detached",
  "studio",
  "other",
]);

const amountUnit = z.enum(["krw", "man"]).default("krw");

const nonNegativeInt = z.number().int().nonnegative();

const scheduleFields = {
  contractDate: dateOnly.nullish(),
  balanceDate: dateOnly.nullish(),
  moveInDate: dateOnly.nullish(),
  residentRegistrationDate: dateOnly.nullish(),
  confirmedDatePlan: dateOnly.nullish(),
};

const propertyFields = {
  title: z.string().trim().min(1).max(120).nullish(),
  roadAddress: z.string().trim().min(1).max(300).nullish(),
  jibunAddress: z.string().trim().max(300).nullish(),
  detailAddress: z.string().trim().max(100).nullish(),
  regionCode: z.string().trim().regex(/^\d{5,10}$/, "법정동코드는 5~10자리 숫자입니다.").nullish(),
  sigungu: z.string().trim().max(60).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  buildingType: buildingTypeSchema.nullish(),
  exclusiveAreaM2: z.number().positive().max(10_000).nullish(),
  floor: z.number().int().min(-10).max(200).nullish(),
  totalFloors: z.number().int().min(1).max(200).nullish(),
  builtYear: z.number().int().min(1900).max(2100).nullish(),
  householdCount: z.number().int().min(1).max(1000).nullish(),
};

const moneyFields = {
  leaseType: leaseTypeSchema.default("monthly"),
  deposit: nonNegativeInt.default(0),
  monthlyRent: nonNegativeInt.default(0),
  maintenanceFee: nonNegativeInt.default(0),
  userMarketPrice: nonNegativeInt.nullish(),
  contractTermMonths: z.number().int().min(1).max(120).default(24),
};

export const createCaseSchema = z
  .object({
    amountUnit,
    ...propertyFields,
    ...moneyFields,
    ...scheduleFields,
  })
  .superRefine((v, ctx) => {
    if (v.leaseType === "jeonse" && v.monthlyRent > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyRent"],
        message: "전세에는 월세를 입력할 수 없습니다. 반전세라면 leaseType을 semi_jeonse로 보내세요.",
      });
    }
    if (v.leaseType !== "jeonse" && v.deposit === 0 && v.monthlyRent === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deposit"],
        message: "보증금과 월세가 모두 0입니다. 최소 하나는 입력해야 합니다.",
      });
    }
    if (v.contractDate && v.balanceDate && v.contractDate > v.balanceDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["balanceDate"],
        message: "잔금일은 계약일보다 빠를 수 없습니다.",
      });
    }
    // 좌표는 둘 다 있어야 의미가 있다.
    if ((v.lat === null || v.lat === undefined) !== (v.lng === null || v.lng === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lat"],
        message: "위도와 경도는 함께 보내야 합니다.",
      });
    }
  });

export const updateCaseSchema = createCaseSchema;

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

/** 만원 단위로 들어온 금액을 원 단위로 변환한 결과 */
export interface NormalizedCaseInput {
  title: string | null;
  roadAddress: string | null;
  jibunAddress: string | null;
  detailAddress: string | null;
  regionCode: string | null;
  sigungu: string | null;
  lat: number | null;
  lng: number | null;
  buildingType: z.infer<typeof buildingTypeSchema> | null;
  exclusiveAreaM2: number | null;
  floor: number | null;
  totalFloors: number | null;
  builtYear: number | null;
  householdCount: number | null;
  leaseType: z.infer<typeof leaseTypeSchema>;
  depositKrw: number;
  monthlyRentKrw: number;
  maintenanceFeeKrw: number;
  userMarketPriceKrw: number | null;
  contractTermMonths: number;
  contractDate: string | null;
  balanceDate: string | null;
  moveInDate: string | null;
  residentRegistrationDate: string | null;
  confirmedDatePlan: string | null;
}

export function normalizeCaseInput(input: CreateCaseInput): NormalizedCaseInput {
  const factor = input.amountUnit === "man" ? MAN : 1;
  const toKrw = (v: number | null | undefined) =>
    v === null || v === undefined ? null : Math.round(v * factor);

  return {
    title: input.title ?? null,
    roadAddress: input.roadAddress ?? null,
    jibunAddress: input.jibunAddress ?? null,
    detailAddress: input.detailAddress ?? null,
    regionCode: input.regionCode ?? null,
    sigungu: input.sigungu ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    buildingType: input.buildingType ?? null,
    exclusiveAreaM2: input.exclusiveAreaM2 ?? null,
    floor: input.floor ?? null,
    totalFloors: input.totalFloors ?? null,
    builtYear: input.builtYear ?? null,
    householdCount: input.householdCount ?? null,
    leaseType: input.leaseType,
    depositKrw: toKrw(input.deposit) ?? 0,
    monthlyRentKrw: toKrw(input.monthlyRent) ?? 0,
    maintenanceFeeKrw: toKrw(input.maintenanceFee) ?? 0,
    userMarketPriceKrw: toKrw(input.userMarketPrice),
    contractTermMonths: input.contractTermMonths,
    contractDate: input.contractDate ?? null,
    balanceDate: input.balanceDate ?? null,
    moveInDate: input.moveInDate ?? null,
    residentRegistrationDate: input.residentRegistrationDate ?? null,
    confirmedDatePlan: input.confirmedDatePlan ?? null,
  };
}

/** 일정만 부분 수정하는 엔드포인트용 */
export const updateScheduleSchema = z.object(scheduleFields).refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: "수정할 일정을 최소 하나는 보내야 합니다." },
);

export const documentTypeSchema = z.enum([
  "registry",
  "brokerage_statement",
  "lease_draft",
  "building_ledger",
  "other",
]);

export const registerDocumentSchema = z.object({
  docType: documentTypeSchema,
  /** Supabase Storage 경로 (클라이언트가 signed URL 로 직접 업로드한 뒤 전달) */
  storagePath: z.string().trim().min(1).max(500),
  originalName: z.string().trim().max(255).nullish(),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  /**
   * 목 모드에서 어떤 판독 시나리오를 적용할지 (`GET /v1/dev/scenarios` 참고).
   * live 모드에서는 무시된다 — 실제 문서를 판독하기 때문이다.
   */
  mockScenario: z.string().trim().max(40).nullish(),
});

export const uploadUrlSchema = z.object({
  docType: documentTypeSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
});

export const analyzeSchema = z.object({
  /** 시세를 다시 조회할지. false면 마지막 조회 결과를 재사용한다. */
  refreshMarketPrice: z.boolean().default(false),
  /** 문서를 다시 파싱할지. 이미 파싱된 문서는 기본적으로 재사용한다. */
  reparseDocuments: z.boolean().default(false),
});

export const interviewAnswerSchema = z.object({
  answers: z.record(
    z.string().regex(/^Q_[A-Z_]+$/, "질문 코드 형식이 올바르지 않습니다."),
    z.union([z.boolean(), z.string().max(200), z.number(), z.array(z.string().max(100)).max(20)]),
  ),
});

export const marketPriceOverrideSchema = z.object({
  amountUnit,
  estimated: z.number().int().positive(),
  note: z.string().trim().max(200).nullish(),
});

export const regionQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().int().min(50).max(5000).optional(),
});
