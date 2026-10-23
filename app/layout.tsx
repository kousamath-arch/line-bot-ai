import type { ReactNode } from "react";

export const metadata = {
  title: "น้องลูกแก้ว",
  description: "LINE Bot ผู้ช่วยพ่อหมอรอลงเวร",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
