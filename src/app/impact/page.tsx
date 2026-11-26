import type { Metadata } from "next";
import { connection } from "next/server";
import { ImpactView } from "@/components/ImpactView";

export const metadata: Metadata = {
  title: "Exposure & Community Impact Simulator",
};

export default async function ImpactPage() {
  await connection();
  return <ImpactView />;
}
