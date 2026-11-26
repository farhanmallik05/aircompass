import type { Metadata } from "next";
import { connection } from "next/server";
import { PlanView } from "@/components/PlanView";

export const metadata: Metadata = {
  title: "Your Tailored Air Plan",
};

export default async function PlanPage() {
  await connection();
  return <PlanView />;
}
