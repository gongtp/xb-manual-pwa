import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "异度资料库｜任务资料维护系统",
  description: "异度神剑系列任务资料库，收录三部曲与 Nintendo Switch《异度神剑X 终极版》简体中文任务。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
