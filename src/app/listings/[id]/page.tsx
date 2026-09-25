import type { Metadata } from "next";
import { ListingPage } from "@/components/ListingPage";

export const metadata: Metadata = { title: "Listing" };

export default async function Listing({ params }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  return <ListingPage key={id} id={id} />;
}
