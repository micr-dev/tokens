import { buildAnalytics } from "../lib/analytics";
import { getPublishedSvgMarkup, getPublishedUsagePayload } from "../lib/usage";
import { SvgUsage } from "./svg-usage";

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
