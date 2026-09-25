import type { Metadata } from "next";
import { SavedPage } from "@/components/SavedPage";

export const metadata: Metadata = { title: "Saved" };

export default function Saved() {
  return <SavedPage />;
}
