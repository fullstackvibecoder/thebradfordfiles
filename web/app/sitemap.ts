import type { MetadataRoute } from "next";
import { listScenarioSlugs } from "@/lib/scenario-loader";

const ORIGIN = "https://www.mayoralrecord.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: ORIGIN + "/", lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: ORIGIN + "/compare", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: ORIGIN + "/issues", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: ORIGIN + "/methodology", lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: ORIGIN + "/about", lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: ORIGIN + "/privacy", lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: ORIGIN + "/terms", lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: ORIGIN + "/candidates", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: ORIGIN + "/candidates/bradford", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: ORIGIN + "/candidates/chow", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: ORIGIN + "/scenarios", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];
  const scenarioEntries: MetadataRoute.Sitemap = listScenarioSlugs().map((slug) => ({
    url: ORIGIN + "/scenarios/" + slug,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  return [...staticEntries, ...scenarioEntries];
}
