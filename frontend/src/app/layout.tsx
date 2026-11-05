import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoSwiftHR | HR Assessment & Calculator Platform",
  description: "GoSwiftHR workforce assessments, submission insights, and administrator tools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-goswift-grey-light text-goswift-navy">
        {children}
      </body>
    </html>
  );
}
