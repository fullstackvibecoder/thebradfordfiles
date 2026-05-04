import { ImageResponse } from "@vercel/og";
export const runtime = "edge";

const COLORS = {
  navy: "#0d2f5c", red: "#da291c", white: "#ffffff",
  green: "#1a5b1a", yellow: "#b58a32", redDot: "#b50909", gray: "#999",
};

function frame(children: any) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "column", width: "1200px", height: "630px", background: COLORS.navy, color: COLORS.white, padding: "60px 80px", fontFamily: "system-ui, sans-serif" }, children } };
}

function landingCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Public Record . The 416" } },
    { type: "div", props: { style: { fontSize: 96, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "An independent, sourced record of Toronto's 2026 mayoral race." } },
  ]);
}

function candidateCard(name: string, recordCount: number, dotColor: string, filesLabel: string) {
  const dotMap: Record<string, string> = { green: COLORS.green, yellow: COLORS.yellow, red: COLORS.redDot };
  const dotHex = dotMap[dotColor] ?? COLORS.gray;
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }, children: [
      { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0 }, children: filesLabel } },
      { type: "div", props: { style: { width: 36, height: 36, borderRadius: 18, background: dotHex } } },
    ] } },
    { type: "div", props: { style: { fontSize: 30, opacity: 0.9 }, children: `${name} . ${recordCount.toLocaleString()} sourced records` } },
  ]);
}

function issuesCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "Issues & Agenda Gap" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "Reader priority vs. candidate emphasis." } },
  ]);
}

function answerCard(q: string) {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Answer . The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 48, fontWeight: 700, lineHeight: 1.15, marginBottom: 24 }, children: q.slice(0, 180) } },
    { type: "div", props: { style: { fontSize: 22, lineHeight: 1.3, opacity: 0.85 }, children: "An open record. Ask a question. Source the answer." } },
  ]);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "landing";
  let element: any;
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
