import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Stepper from "@/components/Stepper";

export default function AnalyzeDocuments() {
  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-6xl px-8 py-11">
        <Stepper current={1} />

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-brand-primary-border px-4.5 py-3.5">
          <Badge>완료</Badge>
          <p className="text-sm text-brand-primary-hover">
            등기부등본 분석이 끝났습니다. 서류를 더 올리면 확인할 수 있는 항목이 늘어납니다.
          </p>
        </div>

        <h1 className="mt-8 font-display text-2xl font-black tracking-tight">추가로 올리면 좋은 서류</h1>
        <p className="mt-2 text-sm text-muted-foreground-light">
          필수가 아닙니다. 서류가 없으면 주소로 조회해 대신할 수 있습니다.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold">중개대상물 확인·설명서</p>
              <Badge variant="brand-outline">권장</Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              중개사가 설명한 내용과 등기부가 일치하는지 대조합니다. 설명서에 빠진 항목도 짚어드립니다.
            </p>
            <div className="mt-4.5 rounded-xl border-2 border-dashed border-border-strong bg-background-alt px-6 py-6 text-center">
              <p className="text-sm text-muted-foreground-light">PDF 또는 사진으로 올려주세요</p>
              <Button variant="outline" className="mt-2.5 rounded-[10px] bg-white">
                파일 선택
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold">임대차 계약서 초안</p>
              <Badge variant="brand-outline">권장</Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              보증금·계약 당사자·특약사항을 확인해, 넣어야 할 특약이 빠졌는지 알려드립니다.
            </p>
            <div className="mt-4.5 flex items-center justify-between rounded-xl border border-brand-primary-border bg-white px-4.5 py-4">
              <p className="text-sm">임대차계약서_초안.pdf</p>
              <p className="text-sm font-bold text-brand-primary">업로드 완료</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-danger-border bg-white px-4.5 py-4">
          <Badge className="bg-danger">주의</Badge>
          <p className="text-sm leading-relaxed text-danger-text">
            서류를 올리지 않으면 이중계약·특약 누락처럼 계약서에서만 확인할 수 있는 항목은 판정에서 빠집니다.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3.5 border-t border-border pt-5.5">
          <Button asChild className="rounded-xl bg-brand-primary px-6 hover:bg-brand-primary-hover">
            <Link to="/analyze/result">서류 포함해서 분석하기</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl border-border-strong">
            <Link to="/analyze/details">건너뛰고 결과 보기</Link>
          </Button>
          <p className="text-sm text-muted-foreground-light">나중에 결과 화면에서도 추가할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
}
