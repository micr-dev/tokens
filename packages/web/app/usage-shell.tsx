import type { ReactNode } from "react";
import { buildAnalytics } from "../lib/analytics";
import {
  getPublishedCostPayload,
  getPublishedSvgMarkup,
  getPublishedUsagePayload,
} from "../lib/usage";
import { SvgUsage } from "./svg-usage";

// Rendered once by the root layout, so every tab route shares one copy of the
// published data and client-side tab switches keep the mounted shell.
export async function UsageShell({ children }: { children: ReactNode }) {
  const [svgMarkup, publishedUsage, publishedCost] = await Promise.all([
    getPublishedSvgMarkup(),
    getPublishedUsagePayload(),
    getPublishedCostPayload(),
  ]);

  return (
    <SvgUsage
      svgMarkup={svgMarkup}
      analytics={
        publishedUsage ? buildAnalytics(publishedUsage, publishedCost) : null
      }
    >
      {children}
    </SvgUsage>
  );
}
