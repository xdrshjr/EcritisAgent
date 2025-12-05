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
  title: "EcritisAgent - AI Document Validation Tool",
  description: "AI-powered document editing, modification, and validation tool",
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
