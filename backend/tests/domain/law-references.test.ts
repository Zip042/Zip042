import { describe, expect, it } from "vitest";
import { encodeJo, LAW_REGISTRY } from "../../src/domain/law-references.js";

describe("encodeJo", () => {
  it("조 번호만 있으면 가지번호를 00으로 채운다", () => {
    expect(encodeJo(3)).toBe("000300");
  });

  it("가지번호가 있으면 뒤 2자리에 넣는다", () => {
    expect(encodeJo(3, 2)).toBe("000302");
  });

  it("주민등록법 제11조를 인코딩한다", () => {
    expect(encodeJo(11)).toBe("001100");
  });

  it("조 번호가 0 이하면 에러", () => {
    expect(() => encodeJo(0)).toThrow();
  });

  it("조 번호가 9999를 넘으면 에러", () => {
    expect(() => encodeJo(10_000)).toThrow();
  });

  it("가지번호가 100 이상이면 에러", () => {
    expect(() => encodeJo(3, 100)).toThrow();
  });

  it("가지번호가 음수면 에러", () => {
    expect(() => encodeJo(3, -1)).toThrow();
  });
});

describe("LAW_REGISTRY", () => {
  it("주택임대차보호법 MST/ID를 갖고 있다", () => {
    expect(LAW_REGISTRY.주택임대차보호법).toEqual({ mst: "276291", id: "001248" });
  });

  it("주민등록법 MST/ID를 갖고 있다", () => {
    expect(LAW_REGISTRY.주민등록법).toEqual({ mst: "268555", id: "001655" });
  });
});
