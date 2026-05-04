import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const TYPE_LANDING = "landing";
const TYPE_CANDIDATE = "candidate";
const TYPE_ISSUES = "issues";
const TYPE_DELIBERATION = "deliberation";

const COLORS = {
  navy: "#0d2f5c",
  navyLight: "#1a4480",
  red: "#da291c",
  white: "#ffffff",
  text: "#1b1b1b",
  muted: "#5a6573",
  green: "#1a5b1a",
  yellow: "#b58a32",
  redDot: "#b50909",
  gray: "#999",
};

function frame(children) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "1200px",
        height: "630px",
        background: COLORS.navy,
        color: COLORS.white,
        padding: "60px 80px",
        fontFamily: "system-ui, sans-serif",
      },
      children,
    },
  };
}

function landingCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Public Record · The 416" } },
    { type: "div", props: { style: { fontSize: 96, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "An independent, sourced record of Toronto's 2026 mayoral race." } },
  ]);
}

function candidateCard(name, recordCount, dotColor, filesLabel) {
  const dotHex = ({green: COLORS.green, yellow: COLORS.yellow, red: COLORS.redDot}[dotColor]) || COLORS.gray;
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }, children: [
      { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0 }, children: filesLabel } },
      { type: "div", props: { style: { width: 36, height: 36, borderRadius: 18, background: dotHex } } },
    ] } },
    { type: "div", props: { style: { fontSize: 30, opacity: 0.9 }, children: `${name} · ${recordCount.toLocaleString()} sourced records` } },
  ]);
}

function issuesCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "Issues & Agenda Gap" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "Reader priority vs. candidate emphasis, across 10 Toronto policy topics." } },
  ]);
}

function deliberationCard(title) {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Deliberation · The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginBottom: 24 }, children: title } },
    { type: "div", props: { style: { fontSize: 26, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "An open conversation. Vote on community statements; see where Torontonians actually agree. Powered by Pol.is." } },
  ]);
}

export default function handler(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || TYPE_LANDING;
  let element;
  if (type === TYPE_CANDIDATE) {
    const name = url.searchParams.get("name") || "Candidate";
    const recordCount = parseInt(url.searchParams.get("records") || "0", 10);
    const dot = url.searchParams.get("dot") || "gray";
    const filesLabel = url.searchParams.get("files_label") || "The Files";
    element = candidateCard(name, recordCount, dot, filesLabel);
  } else if (type === TYPE_ISSUES) {
    element = issuesCard();
  } else if (type === TYPE_DELIBERATION) {
    const title = url.searchParams.get("title") || "Deliberation";
    element = deliberationCard(title);
  } else {
    element = landingCard();
  }
  return new ImageResponse(element, { width: 1200, height: 630 });
}
