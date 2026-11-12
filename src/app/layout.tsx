import type { Metadata, Viewport } from "next";
import { IntroSplash } from "@/components/intro";
import { RegisterSW } from "@/components/pwa";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} · ${APP_TAGLINE}`,
  description: "Book distribution, daily sales and money tracking for Gaurangadham Dhams · Developed by Manima AI-Tech Solutions",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-32.png", sizes: "32x32" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Grantha Seva", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1b40",
};

/* Runs before the page paints: skip the intro if it was already seen in this session,
   or replay it when the URL has ?intro=1. */
const introScript = `try{var q=location.search.indexOf('intro=1')>-1;if(q){sessionStorage.removeItem('gb-intro-seen')}else if(sessionStorage.getItem('gb-intro-seen')){document.documentElement.classList.add('no-splash')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <IntroSplash />
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
