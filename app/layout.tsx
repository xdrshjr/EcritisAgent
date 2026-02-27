import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import "./chat.css";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { DisplayProvider } from "@/lib/displayContext";

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  display: "swap",
  variable: "--font-inter",
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "EcritisAgent - Where Writing Meets Intelligence",
  description: "AI-powered document editing, modification, and validation tool",
  icons: {
    icon: [
      { url: "/logoEcritis.ico", type: "image/x-icon" },
    ],
    shortcut: "/logoEcritis.ico",
    apple: "/logoEcritis.ico",
  },
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <LanguageProvider>
            <DisplayProvider>
              {children}
            </DisplayProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
