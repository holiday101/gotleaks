import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GotLeaks",
  description: "Water leak detection and resident usage data for Providence City",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
