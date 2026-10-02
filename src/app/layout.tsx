import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MiniMax Token Monitor — Dashboard utilizzo Token Plan",
  description:
    "Dashboard interattiva per monitorare l'utilizzo del Token Plan MiniMax in Europa: quota rimanente, finestre di reset, statistiche e orario Europe/Rome.",
  keywords: ["MiniMax", "Token Plan", "monitoraggio", "quota", "dashboard", "API"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "MiniMax Token Monitor",
    description: "Monitora quota e reset del tuo Token Plan MiniMax con fuso orario Europe/Rome.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-right" richColors closeButton theme="dark" />
      </body>
    </html>
  );
}
