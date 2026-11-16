import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay — Your people, one place",
  description:
    "A little space for big ideas. Connect with your community through conversations, channels, and voice.",
  applicationName: "Relay",
};
export const viewport: Viewport = { themeColor: "#17191c", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
