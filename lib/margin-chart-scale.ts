/** Right-hand balance axis, in 億円. Missing balances never enter the domain. */
export type MarginMoneyScale = {
  min: number;
  max: number;
  ticks: number[];
  digits: number;
};

function niceStep(rough: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const unit = rough / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

export function buildMarginMoneyScale(amounts: Array<number | null>): MarginMoneyScale {
  const values = amounts.filter((value): value is number =>
    value !== null && Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!values.length) {
    return { min: 0, max: 1, ticks: [], digits: 0 };
  }
  if (values.at(-1) === 0) {
    return { min: 0, max: 1, ticks: [0, 0.5, 1], digits: 1 };
  }

  const smallest = values[0], largest = values[values.length - 1];
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const padding = (largest - smallest) * 0.2;
  let desiredMin = Math.max(0, smallest - padding);
  let desiredMax = largest + padding;
  const minimumSpan = median * 0.02;
  if (desiredMax - desiredMin < minimumSpan) {
    const center = (smallest + largest) / 2;
    desiredMin = Math.max(0, center - minimumSpan / 2);
    desiredMax = center + minimumSpan / 2;
  }

  const step = niceStep((desiredMax - desiredMin) / 4);
  const first = Math.max(0, Math.floor(desiredMin / step + 1e-9));
  const last = Math.max(first + 1, Math.ceil(desiredMax / step - 1e-9));
  const digits = Math.max(0, Math.min(10, -Math.floor(Math.log10(step))));
  const round = (value: number) => Number(value.toFixed(digits));
  const ticks = Array.from({ length: last - first + 1 }, (_, index) => round((first + index) * step));
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks, digits };
}

export function marginMoneyY(value: number, scale: MarginMoneyScale, top: number, bottom: number): number {
  const fraction = (value - scale.min) / (scale.max - scale.min);
  return Math.max(top, Math.min(bottom, bottom - fraction * (bottom - top)));
}
