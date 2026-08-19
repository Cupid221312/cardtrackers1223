import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Clip — AI Video Clipping",
  description:
    "Turn long-form video into viral-ready vertical clips with AI transcription, hook detection, karaoke captions, and a full manual editing suite.",
  appleWebApp: { capable: true, title: "Clip", statusBarStyle: "black-translucent" },
  // Written by hand rather than via the manifest route: Next's Manifest type
  // models share_target params as an array, but the spec (and browsers) want
  // an object, and share-to-import is the point of installing this.
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#08090c",
  // The editor is a fixed-height app shell, so pinch-zoom would just fight
  // the layout; `viewport-fit` keeps it clear of notches when installed.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* dvh keeps the shell correct when mobile browser chrome hides. */}
      <body className="h-[100dvh] overflow-hidden antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
