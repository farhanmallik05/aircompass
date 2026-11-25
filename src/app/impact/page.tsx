import { connection } from "next/server";
import { ImpactView } from "@/components/ImpactView";

export default async function ImpactPage() {
  await connection();
  return <ImpactView />;
}
