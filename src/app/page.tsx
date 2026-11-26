import type { Metadata } from "next";
import { connection } from "next/server";
import { TodayView } from "@/components/TodayView";

export const metadata: Metadata = {
  title: { absolute: "Today's Air & Household Plan — AirCompass" },
};

export default async function HomePage() {
  await connection();
  return <TodayView />;
}
