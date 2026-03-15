import { getPublishedSvgMarkup } from "../lib/usage";
import { SvgUsage } from "./svg-usage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const svgMarkup = await getPublishedSvgMarkup();

  return <SvgUsage svgMarkup={svgMarkup} />;
}
