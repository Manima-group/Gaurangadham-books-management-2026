import type { Metadata } from "next";
import { Ceremony } from "./ceremony";

export const metadata: Metadata = {
  title: "Launch — Gaurangadham Grantha Seva",
  description: "Launch of Gaurangadham Grantha Seva by His Grace Vedavit Nimai Das Prabhuji",
};

/** Public launch ceremony: tap Launch → flowers, music and a countdown, then the app opens. */
export default function LaunchPage() {
  return <Ceremony />;
}
