import { connection } from "next/server";
import { PlanView } from "@/components/PlanView";

export default async function PlanPage() {
  await connection();
  return <PlanView />;
}
