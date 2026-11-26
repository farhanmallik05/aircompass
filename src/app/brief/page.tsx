import type { Metadata } from "next";
import { connection } from "next/server";
import { BriefView } from "@/components/BriefView";

export const metadata: Metadata = {
  title: "Community & RWA Clean-Air Brief",
};

export default async function BriefPage() {
  await connection();
  return <BriefView />;
}
