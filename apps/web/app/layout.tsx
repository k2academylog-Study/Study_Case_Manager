import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata:Metadata={
  title:{default:"Study Case Manager | Academic management, connected",template:"%s | Study Case Manager"},
  description:"A connected academic workspace for schools and tuition centres. Manage attendance, teaching, assessments, reporting, and AI assistance.",
  icons:{icon:"/mark.svg"},
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  return <html lang="en"><body>{children}</body></html>;
}

