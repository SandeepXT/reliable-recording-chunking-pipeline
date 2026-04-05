import type { Metadata } from "next";
import localFont from "next/font/local";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";

// Use local font files bundled with Next.js to avoid network dependency at build time
const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
  fallback: ["system-ui", "arial"],
});

const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  fallback: ["Courier New", "monospace"],
});

export const metadata: Metadata = {
  title: "Recording Pipeline — Reliable Chunked Audio",
  description:
    "Zero-loss audio recording pipeline with OPFS buffering, S3 bucket upload, PostgreSQL ack, Whisper transcription, and reconciliation. Built with Next.js, Hono, Bun, Drizzle, and MinIO.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <div className="grid h-svh grid-rows-[auto_1fr] overflow-hidden">
            <Header />
            <main className="overflow-y-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
