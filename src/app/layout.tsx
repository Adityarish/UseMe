import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: { default: "UseMe — Share anything, instantly", template: "%s · UseMe" },
  description: "Share files and text through one simple, secure link.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#3563e9", colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Header />
        <main>{children}</main>
        <ServiceWorker />
      </body>
    </html>
  );
}
