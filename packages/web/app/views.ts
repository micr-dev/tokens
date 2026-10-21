export const usageViews = [
  { id: "heatmap", slug: null, label: "Harnesses" },
  { id: "models", slug: "models", label: "Models" },
  { id: "cost", slug: "cost", label: "Cost" },
  { id: "details", slug: "details", label: "Details" },
] as const;

export type UsageView = (typeof usageViews)[number];
export type UsageViewId = UsageView["id"];

export const usageViewSlugs = usageViews.flatMap((view) =>
  view.slug ? [view.slug] : [],
);

export function getUsageViewHref(view: UsageView) {
  return view.slug ? `/${view.slug}` : "/";
}

/**
 * Maps the root layout's selected child segment to a view: `null` is the root
 * page (Harnesses), a known slug is its tab, anything else is not a view.
 */
export function findUsageViewBySegment(segment: string | null) {
  return usageViews.find((view) => view.slug === segment) ?? null;
}
