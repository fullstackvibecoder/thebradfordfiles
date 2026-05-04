import type { Stamp } from "@/lib/stamp-types";

const ICON_GLYPH: Record<NonNullable<Stamp["icon"]>, string> = {
  council: "▣",
  ig: "▣",
  video: "▶",
  verified: "★",
};

export function StampPill({ stamp }: { stamp: Stamp }) {
  const flavor = stamp.flavor ?? "neutral";
  const cls = flavor === "verified" ? "stamp stamp-verified" : "stamp";
  const glyph = stamp.icon ? ICON_GLYPH[stamp.icon] + " " : "";
  const content = <span>{glyph}{stamp.label}</span>;
  if (stamp.href) {
    return <a href={stamp.href} target="_blank" rel="noopener noreferrer" className={cls + " no-underline"}>{content}</a>;
  }
  return <span className={cls}>{content}</span>;
}
