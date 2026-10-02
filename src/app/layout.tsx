import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://paddock.rad-race.com"),

  title: "RAD RACE ONETWENTY PADDOCK",
  description: "Meet the riders. Discover the teams. Find your crew.",

  openGraph: {
    title: "RAD RACE ONETWENTY PADDOCK",
    description: "Meet the riders. Discover the teams. Find your crew.",
    url: "https://paddock.rad-race.com",
    siteName: "RAD RACE",
    type: "website",
  },
};

import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}