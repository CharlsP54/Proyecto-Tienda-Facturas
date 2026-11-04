import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mi Tienda · Facturas y costos",
  description: "Revisa tus documentos de compra, comprueba sus valores y mantén los costos de tu tienda al día.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-EC">
      <body className="antialiased">{children}</body>
    </html>
  );
}
