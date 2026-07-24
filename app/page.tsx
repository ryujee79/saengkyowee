import type { Metadata } from "next";
import { DisciplineApp } from "./DisciplineApp";

export const metadata: Metadata = {
  title: "학생생활교육 징계 산정",
  description:
    "나이스 출결과 생활지도 엑셀 파일을 브라우저에서 안전하게 분석해 징계 기준을 산정합니다.",
};

export default function Home() {
  return <DisciplineApp />;
}
