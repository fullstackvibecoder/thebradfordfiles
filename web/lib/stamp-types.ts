export type StampFlavor = "neutral" | "verified";

export interface Stamp {
  label: string;
  href?: string;
  flavor?: StampFlavor;
  icon?: "council" | "ig" | "video" | "verified";
}
