import { RelayApp } from "@/components/relay-app";

export const dynamic = "force-dynamic";
export default function Page() {
  return <RelayApp mode={process.env.DATABASE_URL ? "connected" : "demo"} />;
}
