import { connection } from "next/server";
import { TodayView } from "@/components/TodayView";

export default async function HomePage() {
  await connection();
  return <TodayView />;
}
