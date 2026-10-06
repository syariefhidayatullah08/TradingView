import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import KawaiiBackdrop from "@/components/KawaiiBackdrop";
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
  themeColor: "#fbcfe8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <KawaiiBackdrop />
        <ClerkProvider
          localization={idID}
          appearance={{
            variables: { colorPrimary: "#ec4899", colorBackground: "#ffffff", borderRadius: "12px" },
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
