import { buildAnalytics } from "../lib/analytics";
import { getPublishedSvgMarkup } from "../lib/usage";
import { SvgUsage } from "./svg-usage";
import { getPublishedUsagePayload } from "../lib/usage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [svgMarkup, publishedUsage] = await Promise.all([
    getPublishedSvgMarkup(),
    getPublishedUsagePayload(),
  ]);

  return (
    <SvgUsage
      svgMarkup={svgMarkup}
      analytics={publishedUsage ? buildAnalytics(publishedUsage) : null}
    />
  );
}
