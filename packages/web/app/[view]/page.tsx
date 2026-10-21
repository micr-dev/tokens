import type { Metadata } from "next";
import { findUsageViewBySegment, usageViewSlugs } from "../views";

interface ViewPageProps {
  params: Promise<{ view: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return usageViewSlugs.map((view) => ({ view }));
}

export async function generateMetadata({
  params,
}: ViewPageProps): Promise<Metadata> {
  const view = findUsageViewBySegment((await params).view);

  return view ? { title: view.label } : {};
}

// The root layout renders the tab selected by this segment.
export default function ViewPage() {
  return null;
}
