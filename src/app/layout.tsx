import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";

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
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
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
    /* I78 — tema chiaro opzionale: strategia class, default SCURO (comportamento
       invariato finché l'utente non sceglie esplicitamente); `suppressHydrationWarning`
       su <html> evita il mismatch mentre next-themes assegna la classe. */
    <html lang="it" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <PwaRegister />
          {/* Il wrapper shadcn del Toaster legge già useTheme (I78): niente forzatura dark */}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
