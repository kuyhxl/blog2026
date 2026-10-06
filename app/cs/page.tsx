import type { Metadata } from "next";
import { csMapData } from "@/lib/csmap/data";
import CsMap from "@/components/csmap/CsMap";

export const metadata: Metadata = { title: "Beauty of CS" };

// Beauty of CS. 이 화면에는 푸터가 없고, 아래 줄이 푸터를 대신한다
export default function CsPage() {
  return <CsMap data={csMapData()} />;
}
