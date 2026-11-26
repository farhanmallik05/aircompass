import type { Metadata } from "next";
import { connection } from "next/server";
import { TodayView } from "@/components/TodayView";

export const metadata: Metadata = {
  title: "Today's Air & Household Plan",
};

export default async function HomePage() {
  await connection();
  return <TodayView />;
}
