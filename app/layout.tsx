import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import ThemeBackdrop from "@/components/ThemeBackdrop";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-config";
import { dark } from "@clerk/ui/themes";
import { idID } from "@clerk/localizations";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KriptoScope — Analisa Crypto & Berita Dunia",
  description: "Dashboard analisa teknikal crypto dengan berita politik dan ekonomi dunia terbaru.",
  appleWebApp: { capable: true, title: "KriptoScope", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b1026",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The boot script sets data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeBackdrop />
        <ClerkProvider
          localization={idID}
          appearance={{
            theme: dark,
            variables: { colorPrimary: "#818cf8", colorBackground: "#0f1533", borderRadius: "12px" },
          }}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
