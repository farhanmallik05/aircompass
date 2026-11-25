import { connection } from "next/server";
import { BriefView } from "@/components/BriefView";

export default async function BriefPage() {
  await connection();
  return <BriefView />;
}
