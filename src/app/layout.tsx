import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clip — AI Video Clipping",
  description:
    "Turn long-form video into viral-ready vertical clips with AI transcription, hook detection, karaoke captions, and a full manual editing suite.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden antialiased">{children}</body>
    </html>
  );
}
