import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const CF_TOKEN = process.env.CLOUDFLARE_BEACON_TOKEN ?? "";

export const metadata: Metadata = {
  title: "The Mayoral Record",
  description: "Toronto's 2026 mayoral race, sourced and queryable.",
  metadataBase: new URL("https://www.mayoralrecord.com"),
  openGraph: {
    siteName: "The Mayoral Record",
    type: "website",
    images: [{ url: "/api/og?type=landing", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {CF_TOKEN ? (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: CF_TOKEN })}
          />
        ) : null}
      </body>
    </html>
  );
}
