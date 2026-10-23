import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drugslist · 药品与会员评价",
  description: "查询药品资料、公开价格及会员的真实体验。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
