import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScenario, listScenarioSlugs } from "@/lib/scenario-loader";
import { ScenarioCard } from "@/components/ScenarioCard";

export async function generateStaticParams() {
  return listScenarioSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const card = getScenario(slug);
  if (!card) return { title: "Scenario not found . The Mayoral Record" };
  const ogUrl = "/api/og?type=scenario&slug=" + encodeURIComponent(slug);
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

export default async function ScenarioDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const card = getScenario(slug);
  if (!card) notFound();
  return <ScenarioCard card={card} />;
}
