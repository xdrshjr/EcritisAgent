import type { Metadata } from "next";
import "./globals.css";
import "./chat.css";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";

// Use system fonts for desktop build to avoid Google Fonts fetch issues
const dmSans = {
  variable: "--font-sans",
  className: "",
};

const spaceMono = {
  variable: "--font-mono",
  className: "",
};

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
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${spaceMono.variable} antialiased`} suppressHydrationWarning>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
