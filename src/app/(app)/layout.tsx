import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { Toaster } from "@/components/ui";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-current-path") || "/";

  return (
    <div className="flex min-h-screen">
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar pathname={pathname} />
        <main className="flex-1 overflow-x-hidden print:overflow-visible">
          <div className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8 print:m-0 print:max-w-none print:p-0">
            {children}
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
