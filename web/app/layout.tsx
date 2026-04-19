import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flanner — a mirror on your delivery habits",
  description:
    "Flanner (flanner.health) analyzes your real order history and mirrors it 1:1 into healthy home-cooked meals, with ingredients auto-shopped.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="font-sans text-charcoal antialiased">{children}</body>
    </html>
  );
}
