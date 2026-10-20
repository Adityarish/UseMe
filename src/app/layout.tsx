import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { ServiceWorker } from "@/components/service-worker";

const siteTitle = "UseMe — Share anything, instantly";
const siteDescription = "Your documents. Safer. Smarter. Anywhere. — ATN";
const shareImage = {
  url: "/link_url.png",
  width: 731,
  height: 288,
  alt: "UseMe — Your documents. Safer. Smarter. Anywhere.",
};

function getMetadataBase(): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return new URL(configuredUrl);

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(vercelHost ? `https://${vercelHost}` : "http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: { default: siteTitle, template: "%s · UseMe" },
  description: siteDescription,
  applicationName: "UseMe",
  authors: [{ name: "ATN" }],
  creator: "ATN",
  publisher: "ATN",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "UseMe",
    title: siteTitle,
    description: siteDescription,
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [shareImage],
  },
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
