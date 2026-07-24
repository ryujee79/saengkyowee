import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "학생생활교육 징계 산정",
  description:
    "나이스 출결과 생활지도 엑셀 파일을 브라우저에서 분석해 징계 기준을 산정하는 학교 업무 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
