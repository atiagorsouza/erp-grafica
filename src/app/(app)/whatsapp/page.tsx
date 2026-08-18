import type { Metadata } from "next";
import { WhatsAppClient } from "@/components/modules/WhatsAppClient";

export const metadata: Metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

export default function WhatsAppPage() {
  return <WhatsAppClient />;
}
