import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/theme';
import CssBaseline from '@mui/material/CssBaseline';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Juego de Finanzas",
  description: "Juego de mesa multijugador en tiempo real",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <Providers>
              <CssBaseline />
              {children}
            </Providers>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
