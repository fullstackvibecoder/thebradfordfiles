import { ImageResponse } from "@vercel/og";
import { getScenario } from "@/lib/scenario-loader";
import { getReceipt } from "@/lib/receipt-loader";
export const runtime = "nodejs";

const COLORS = {
  bg: "#15110d",
  ink: "#e8e3d5",
  muted: "#8a8275",
  accent: "#c4923a",
  rule: "#2a2520",
  green: "#3a8a3a",
  yellow: "#d4a548",
  redDot: "#d44848",
  gray: "#8a8275",
};

const DOC = {
  bg: "#15110d",
  ink: "#e8e3d5",
  muted: "#8a8275",
  accent: "#c4923a",
};

function frame(children: any) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "column", width: "1200px", height: "630px", background: COLORS.bg, color: COLORS.ink, padding: "60px 80px", fontFamily: "system-ui, sans-serif" }, children } };
}

function landingCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.accent, marginBottom: 16 }, children: "Public Record . The 416" } },
    { type: "div", props: { style: { fontSize: 96, fontWeight: 700, lineHeight: 1.0, marginBottom: 24, color: COLORS.ink }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, color: COLORS.ink, opacity: 0.85, maxWidth: 1000 }, children: "An independent, sourced record of Toronto's 2026 mayoral race." } },
  ]);
}

function candidateCard(name: string, recordCount: number, dotColor: string, filesLabel: string) {
  const dotMap: Record<string, string> = { green: COLORS.green, yellow: COLORS.yellow, red: COLORS.redDot };
  const dotHex = dotMap[dotColor] ?? COLORS.gray;
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.accent, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }, children: [
      { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0, color: COLORS.ink }, children: filesLabel } },
      { type: "div", props: { style: { width: 36, height: 36, borderRadius: 18, background: dotHex } } },
    ] } },
    { type: "div", props: { style: { fontSize: 30, color: COLORS.ink, opacity: 0.9 }, children: `${name} . ${recordCount.toLocaleString()} sourced records` } },
  ]);
}

function issuesCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.accent, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0, marginBottom: 24, color: COLORS.ink }, children: "Issues & Agenda Gap" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, color: COLORS.ink, opacity: 0.85, maxWidth: 1000 }, children: "Reader priority vs. candidate emphasis." } },
  ]);
}

function answerCard(q: string) {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.accent, marginBottom: 16 }, children: "Answer . The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 48, fontWeight: 700, lineHeight: 1.15, marginBottom: 24, color: COLORS.ink }, children: q.slice(0, 180) } },
    { type: "div", props: { style: { fontSize: 22, lineHeight: 1.3, color: COLORS.ink, opacity: 0.85 }, children: "An open record. Ask a question. Source the answer." } },
  ]);
}

function docFrame(children: any) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "column", width: "1200px", height: "630px", background: DOC.bg, color: DOC.ink, padding: "60px 80px", fontFamily: "system-ui, sans-serif" }, children } };
}

function scenarioCard(topicShort: string, pullQuote: string, slug: string) {
  return docFrame([
    { type: "div", props: { style: { fontFamily: "ui-monospace, monospace", fontSize: 16, textTransform: "uppercase", letterSpacing: "0.12em", color: DOC.muted, marginBottom: 24 }, children: "Scenario . The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginBottom: 32, letterSpacing: "-0.02em", color: DOC.ink }, children: topicShort } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.4, color: DOC.ink, maxWidth: 1000 }, children: pullQuote } },
    { type: "div", props: { style: { marginTop: "auto", fontFamily: "ui-monospace, monospace", fontSize: 14, color: DOC.muted, textTransform: "uppercase", letterSpacing: "0.1em" }, children: `mayoralrecord.com/scenarios/${slug}` } },
  ]);
}

function scenariosIndexCard() {
  return docFrame([
    { type: "div", props: { style: { fontFamily: "ui-monospace, monospace", fontSize: 16, textTransform: "uppercase", letterSpacing: "0.12em", color: DOC.muted, marginBottom: 24 }, children: "Scenarios . The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 80, fontWeight: 700, lineHeight: 1.05, marginBottom: 32, letterSpacing: "-0.02em", color: DOC.ink }, children: "Policy scenarios" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.4, color: DOC.ink, maxWidth: 980 }, children: "Curated, evidence-backed analysis of contested positions in the Toronto 2026 race." } },
  ]);
}

const RED = "#c44848";

function receiptHeader(label: string) {
  return { type: "div", props: { style: { display: "flex", alignItems: "center", marginBottom: 24 }, children: [
    { type: "div", props: { style: { display: "flex", fontFamily: "ui-monospace, monospace", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.12em", color: RED, border: `1px solid ${RED}`, padding: "4px 10px", borderRadius: 2, marginRight: 16 }, children: "AUDITED" } },
    { type: "div", props: { style: { display: "flex", fontFamily: "ui-monospace, monospace", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.12em", color: DOC.muted }, children: label } },
  ] } };
}

function receiptCard(topicShort: string, pullQuote: string, slug: string) {
  return docFrame([
    receiptHeader("Receipt . The Mayoral Record"),
    { type: "div", props: { style: { fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginBottom: 32, letterSpacing: "-0.02em", color: DOC.ink }, children: topicShort } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.4, color: DOC.ink, maxWidth: 1000 }, children: pullQuote } },
    { type: "div", props: { style: { display: "flex", marginTop: "auto", fontFamily: "ui-monospace, monospace", fontSize: 14, color: DOC.muted, textTransform: "uppercase", letterSpacing: "0.1em" }, children: `mayoralrecord.com/receipts/${slug}` } },
  ]);
}

function receiptsIndexCard() {
  return docFrame([
    receiptHeader("Receipts . The Mayoral Record"),
    { type: "div", props: { style: { fontSize: 80, fontWeight: 700, lineHeight: 1.05, marginBottom: 32, letterSpacing: "-0.02em", color: DOC.ink }, children: "Receipts" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.4, color: DOC.ink, maxWidth: 980 }, children: "Verbatim attributed claims, audited against Toronto Open Data." } },
  ]);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "landing";
  let element: any;
  if (type === "scenario") {
    const slug = url.searchParams.get("slug") ?? "";
    const card = getScenario(slug);
    if (!card) {
      return new Response("not found", { status: 404 });
    }
    element = scenarioCard(card.topic_short, card.pull_quote, card.slug);
    return new ImageResponse(element, { width: 1200, height: 630 });
  }
  if (type === "scenarios-index") {
    element = scenariosIndexCard();
    return new ImageResponse(element, { width: 1200, height: 630 });
  }
  if (type === "receipt") {
    const slug = url.searchParams.get("slug") ?? "";
    const card = getReceipt(slug);
    if (!card) {
      return new Response("not found", { status: 404 });
    }
    element = receiptCard(card.topic_short, card.pull_quote, card.slug);
    return new ImageResponse(element, { width: 1200, height: 630 });
  }
  if (type === "receipts-index") {
    element = receiptsIndexCard();
    return new ImageResponse(element, { width: 1200, height: 630 });
  }
  if (type === "candidate") {
    element = candidateCard(
      url.searchParams.get("name") ?? "Candidate",
      parseInt(url.searchParams.get("records") ?? "0", 10),
      url.searchParams.get("dot") ?? "gray",
      url.searchParams.get("files_label") ?? "The Files",
    );
  } else if (type === "issues") element = issuesCard();
  else if (type === "answer") element = answerCard(url.searchParams.get("q") ?? "");
  else element = landingCard();
  return new ImageResponse(element, { width: 1200, height: 630 });
}
