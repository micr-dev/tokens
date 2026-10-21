export interface ChartPoint {
  x: number;
  y: number;
}

const niceStepMultipliers = [1, 2, 2.5, 5, 10];

/**
 * Evenly spaced axis ticks from 0 through the first "nice" value (1, 2, 2.5,
 * or 5 times a power of ten) that covers `peak`.
 */
export function getBurnAxisTicks(peak: number, targetCount = 4) {
  if (!(peak > 0)) {
    return [0];
  }

  const rawStep = peak / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const multiplier =
    niceStepMultipliers.find(
      (candidate) => rawStep / magnitude <= candidate + 1e-9,
    ) ?? 10;
  const step = multiplier * magnitude;
  const count = Math.ceil(peak / step - 1e-9);

  return Array.from({ length: count + 1 }, (_, index) => index * step);
}

function formatPoint(point: ChartPoint) {
  return `${Math.round(point.x * 100) / 100} ${Math.round(point.y * 100) / 100}`;
}

// Fritsch-Carlson tangent: zero at local extrema, never steep enough to
// overshoot, so a stacked layer never dips below zero between days.
function getInteriorTangent(
  leftWidth: number,
  rightWidth: number,
  leftSlope: number,
  rightSlope: number,
) {
  const weighted =
    (leftSlope * rightWidth + rightSlope * leftWidth) /
    (leftWidth + rightWidth);

  return (
    (Math.sign(leftSlope) + Math.sign(rightSlope)) *
      Math.min(
        Math.abs(leftSlope),
        Math.abs(rightSlope),
        0.5 * Math.abs(weighted),
      ) || 0
  );
}

/**
 * SVG path commands for a monotone cubic curve through `points` (sorted by x),
 * starting with a move to the first point.
 */
export function buildMonotoneLinePath(points: ChartPoint[]) {
  if (points.length === 0) {
    return "";
  }

  if (points.length < 3) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"}${formatPoint(point)}`)
      .join(" ");
  }

  const widths = points
    .slice(1)
    .map((point, index) => point.x - points[index].x);
  const slopes = points
    .slice(1)
    .map((point, index) => (point.y - points[index].y) / widths[index]);
  const tangents = points.map((_, index) =>
    index === 0 || index === points.length - 1
      ? Number.NaN
      : getInteriorTangent(
          widths[index - 1],
          widths[index],
          slopes[index - 1],
          slopes[index],
        ),
  );
  const last = points.length - 1;

  tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
  tangents[last] = (3 * slopes[last - 1] - tangents[last - 1]) / 2;

  const commands = [`M${formatPoint(points[0])}`];

  for (let index = 0; index < last; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const third = widths[index] / 3;

    commands.push(
      `C${formatPoint({ x: from.x + third, y: from.y + tangents[index] * third })} ${formatPoint(
        { x: to.x - third, y: to.y - tangents[index + 1] * third },
      )} ${formatPoint(to)}`,
    );
  }

  return commands.join(" ");
}

/** Closed area under the monotone curve through `points`, down to `baseline`. */
export function buildMonotoneAreaPath(points: ChartPoint[], baseline: number) {
  if (points.length === 0) {
    return "";
  }

  const first = points[0];
  const last = points[points.length - 1];

  return `M${formatPoint({ x: first.x, y: baseline })} L${buildMonotoneLinePath(
    points,
  ).slice(1)} L${formatPoint({ x: last.x, y: baseline })} Z`;
}
