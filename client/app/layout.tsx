import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://whatsnext.app";

export const metadata: Metadata = {
  // ── Core ──────────────────────────────────────────────────
  metadataBase: new URL(APP_URL),
  title: {
    default: "What's Next — All-in-One Productivity Workspace",
    template: "%s | What's Next",
  },
  description:
    "What's Next is a unified productivity workspace for tasks, projects, notes, tickets, SQL snippets, calendar, time tracking, and AI assistance. Stop switching apps. Start getting things done.",

  // ── Keywords ──────────────────────────────────────────────
  keywords: [
    "productivity app",
    "task manager",
    "project management",
    "note taking app",
    "ticket tracker",
    "knowledge base",
    "time tracker",
    "SQL snippet manager",
    "all in one workspace",
    "personal productivity",
    "AI productivity tool",
    "Notion alternative",
    "Linear alternative",
    "developer productivity",
  ],

  // ── Canonical + Indexing ───────────────────────────────────
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // ── Open Graph (LinkedIn, Facebook, WhatsApp) ──────────────
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "What's Next",
    title: "What's Next — All-in-One Productivity Workspace",
    description:
      "Unified workspace for tasks, projects, notes, tickets, SQL, and AI. Built for engineers and technical professionals who are tired of context switching.",
    images: [
      {
        url: "/og-image.png",      // Create a 1200x630 image for this
        width: 1200,
        height: 630,
        alt: "What's Next — Productivity Workspace",
        type: "image/png",
      },
    ],
  },

  // ── Twitter / X Card ──────────────────────────────────────
  twitter: {
    card: "summary_large_image",
    title: "What's Next — All-in-One Productivity Workspace",
    description:
      "Stop switching between Notion, Todoist, Outlook, and sticky notes. What's Next brings everything into one intelligent workspace.",
    images: ["/og-image.png"],
    creator: "@iam_doomaf",
  },

  // ── App / PWA ──────────────────────────────────────────────
  applicationName: "What's Next",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  authors: [{ name: "Ashutosh Rath" }],
  creator: "Ashutosh Rath",
  publisher: "Ashutosh Rath",

  // ── Icons ──────────────────────────────────────────────────
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.png",
  },

  // ── PWA Manifest ──────────────────────────────────────────
  manifest: "/manifest.json",

  // ── Verification (add when you set up Search Console) ─────
  // verification: {
  //   google: "your-google-site-verification-token",
  // },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ── Structured Data (JSON-LD) ── */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "What's Next",
              url: APP_URL,
              description:
                "An all-in-one productivity workspace for tasks, projects, notes, tickets, SQL snippets, calendar, time tracking, and AI assistance.",
              applicationCategory: "ProductivityApplication",
              operatingSystem: "Web, iOS, Android",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              author: {
                "@type": "Person",
                name: "Ashutosh Rath",
              },
              featureList: [
                "Task Management",
                "Project Management",
                "Note Taking",
                "Ticket Tracker",
                "Knowledge Base",
                "SQL Snippet Library",
                "Time Tracker",
                "AI Assistant",
                "Universal Search",
                "Calendar",
              ],
            }),
          }}
        />

        {/* ── Performance hints ── */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        {/* ── Theme color for mobile browsers ── */}
        <meta name="theme-color" content="#0a0a0a" />
        <meta name="color-scheme" content="dark light" />

        {/* ── Mobile app capable ── */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="What's Next" />
      </head>
      <body className={inter.className}>
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}