import type { Metadata } from "next";
import "./globals.css";
import "./chat.css";
import FloatingChatButton from "@/components/FloatingChatButton";

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
  title: "DocAIMaster - AI Document Validation Tool",
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
        {children}
        <FloatingChatButton />
      </body>
    </html>
  );
}
