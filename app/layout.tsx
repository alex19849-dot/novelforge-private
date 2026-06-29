import "./globals.css";

export const metadata = {
  title: "NovelForge",
  description: "Private Romance Story Builder",
  manifest: "/manifest.json",
  themeColor: "#7a5c3e",
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
