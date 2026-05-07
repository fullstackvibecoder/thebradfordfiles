import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReceipt, listReceiptSlugs } from "@/lib/receipt-loader";
import { ReceiptCard } from "@/components/ReceiptCard";

export async function generateStaticParams() {
  return listReceiptSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const card = getReceipt(slug);
  if (!card) return { title: "Receipt not found . The Mayoral Record" };
  const ogUrl = "/api/og?type=receipt&slug=" + encodeURIComponent(slug);
  return {
    title: card.topic_short + " . The Mayoral Record",
    description: card.pull_quote,
    openGraph: {
      title: card.topic_short + " . The Mayoral Record",
      description: card.pull_quote,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: card.topic_short,
      description: card.pull_quote,
      images: [ogUrl],
    },
  };
}

export default async function ReceiptDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const card = getReceipt(slug);
  if (!card) notFound();
  return <ReceiptCard card={card} />;
}
