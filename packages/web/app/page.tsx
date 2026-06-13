import { buildAnalytics } from "../lib/analytics";
import { getPublishedSvgMarkup } from "../lib/usage";
import { SvgUsage } from "./svg-usage";
import {
  getPublishedCostPayload,
  getPublishedUsagePayload,
} from "../lib/usage";

export default async function Page() {
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
    />
  );
}
