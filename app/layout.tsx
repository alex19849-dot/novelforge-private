import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NovelForge",
  description: "Private Romance Story Builder",
  manifest: "/manifest.json",
  themeColor: "#7a5c3e",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
