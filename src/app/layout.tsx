import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://teamfinder.rad-race.com"),

  title: "RAD RACE Teamfinder",
  description: "Find your crew. Build your team. Ride together.",

  openGraph: {
    title: "RAD RACE Teamfinder",
    description: "Find your crew. Build your team. Ride together.",
    url: "https://teamfinder.rad-race.com",
    siteName: "RAD RACE",
    type: "website",
  },
};

import "./globals.css";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
