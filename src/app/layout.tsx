// import type { Metadata } from "next";
// import { Inter, Oswald, IBM_Plex_Mono } from "next/font/google";
// import "./globals.css";

// const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-oswald" });
// const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono" });

// export const metadata: Metadata = {
//   title: "  Kizz Lubricants — Admin",
//   description: "Business ledger admin panel for Kizz Lubricants",
// };

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html lang="en">
//       <body className={`${inter.variable} ${oswald.variable} ${plexMono.variable} font-body antialiased`}>
//         {children}
//       </body>
//     </html>
//   );
// }


import type { Metadata } from "next";
import { Inter, Orbitron, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// 1. Orbitron ko wapas import karein
const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter",
  display: "swap" // Lag/blink hatane ke liye ye bahut zaroori hai
});

const orbitron = Orbitron({ 
  subsets: ["latin"], 
  weight: ["400", "500", "600", "700", "800", "900"], 
  variable: "--font-orbitron",
  display: "swap"
});

const plexMono = IBM_Plex_Mono({ 
  subsets: ["latin"], 
  weight: ["400", "500", "600"], 
  variable: "--font-plex-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Kizz Lubricants — Admin",
  description: "Business ledger admin panel for Kizz Lubricants",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${plexMono.variable}`}>
      <body className="font-body antialiased bg-white text-ink">
        {children}
      </body>
    </html>
  );
}
