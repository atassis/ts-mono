import clsx from "clsx";
import { FC, useState } from "react";

import { formatPercent } from "@tsmono/util";

import { Log, SampleSummary } from "../../client/api/types";

import {
  accuracyDomain,
  buildFrontierPoints,
  costDomain,
  CostMetric,
  formatCost,
  FrontierPoint,
  linearScale,
  niceTicks,
  paretoFrontier,
} from "./frontier";
import styles from "./FrontierChart.module.css";
import { shortRunLabel } from "./shortRunLabel";

interface FrontierChartProps {
  runs: readonly (Log | undefined)[];
  summaries: readonly SampleSummary[][];
  scorer: string | undefined;
}

const kWidth = 640;
const kHeight = 220;
const kMargin = { top: 14, right: 20, bottom: 26, left: 46 };

const ciHalfWidth = (point: FrontierPoint): number => 1.96 * (point.stderr ?? 0);

/**
 * Quality-vs-cost scatter for the runs picked in the grid: one point per
 * run, x = median cost per sample-epoch, y = accuracy with a 95% CI error
 * bar. The Pareto frontier (no other run beats it on both axes) is
 * highlighted and connected; dominated runs are dimmed but never hidden —
 * overlapping error bars must stay visible so two indistinguishable runs
 * read as indistinguishable, not as a clear winner.
 */
export const FrontierChart: FC<FrontierChartProps> = ({
  runs,
  summaries,
  scorer,
}) => {
  const [metric, setMetric] = useState<CostMetric>("tokens");
  const [activeRun, setActiveRun] = useState<number | undefined>(undefined);

  const allModels = runs
    .map((run) => run?.model)
    .filter((m): m is string => Boolean(m));
  const label = (i: number): string => shortRunLabel(runs[i], allModels);
  const points = buildFrontierPoints(runs, summaries, scorer, metric, label);

  // Nothing to compare yet (still loading, or only one run has both an
  // accuracy and a cost) — the grid table below carries the page's loading
  // and empty states, so this stays silent rather than showing an
  // almost-empty chart.
  if (points.length < 2) return null;

  const { indices: onFrontier, line } = paretoFrontier(points);
  const [costMin, costMax] = costDomain(points);
  const [accMin, accMax] = accuracyDomain(points);

  const plotLeft = kMargin.left;
  const plotRight = kWidth - kMargin.right;
  const plotTop = kMargin.top;
  const plotBottom = kHeight - kMargin.bottom;

  const x = linearScale(costMin, costMax, plotLeft, plotRight);
  const y = linearScale(accMin, accMax, plotBottom, plotTop);

  const xTicks = niceTicks(costMin, costMax, 5);
  const yTicks = niceTicks(accMin, accMax, 4);

  const linePoints = line.map((p) => `${x(p.cost)},${y(p.accuracy)}`).join(" ");
  const active = points.find((p) => p.runIndex === activeRun);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Quality vs cost</span>
        <div className={styles.toggle} role="radiogroup" aria-label="Cost metric">
          {(["tokens", "time"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metric === m}
              className={clsx(styles.toggleBtn, metric === m && styles.toggleActive)}
              onClick={() => setMetric(m)}
            >
              {m === "tokens" ? "tokens" : "time"}
            </button>
          ))}
        </div>
      </div>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${kWidth} ${kHeight}`}
        role="img"
        aria-label={`Accuracy versus median ${metric === "tokens" ? "tokens" : "time"} per sample, ${points.length} runs`}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              className={styles.gridline}
              x1={plotLeft}
              x2={plotRight}
              y1={y(t)}
              y2={y(t)}
            />
            <text
              className={styles.axisLabel}
              x={plotLeft - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatPercent(t, 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            className={styles.axisLabel}
            x={x(t)}
            y={kHeight - kMargin.bottom + 16}
            textAnchor="middle"
          >
            {formatCost(t, metric)}
          </text>
        ))}
        {line.length >= 2 ? (
          <polyline className={styles.frontierLine} points={linePoints} />
        ) : null}
        {points.map((p) => {
          const frontier = onFrontier.has(p.runIndex);
          const cx = x(p.cost);
          const cy = y(p.accuracy);
          const half = ciHalfWidth(p);
          const yLo = y(Math.max(0, p.accuracy - half));
          const yHi = y(Math.min(1, p.accuracy + half));
          return (
            <g
              key={p.runIndex}
              className={clsx(styles.point, frontier ? styles.onFrontier : styles.dominated)}
              tabIndex={0}
              aria-label={`${p.label}: ${formatPercent(p.accuracy, 1)}${
                half > 0 ? ` ± ${formatPercent(half, 1)}` : ""
              }, ${formatCost(p.cost, metric)}${frontier ? ", on the Pareto frontier" : ""}`}
              onMouseEnter={() => setActiveRun(p.runIndex)}
              onMouseLeave={() => setActiveRun(undefined)}
              onFocus={() => setActiveRun(p.runIndex)}
              onBlur={() => setActiveRun(undefined)}
            >
              {half > 0 ? (
                <line className={styles.errorBar} x1={cx} x2={cx} y1={yLo} y2={yHi} />
              ) : null}
              <circle className={styles.dot} cx={cx} cy={cy} r={5} />
              <text className={styles.pointLabel} x={cx} y={cy - 10} textAnchor="middle">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      {active ? (
        <div className={styles.tooltip}>
          <strong>{active.label}</strong>
          {": "}
          {formatPercent(active.accuracy, 1)}
          {ciHalfWidth(active) > 0 ? ` ± ${formatPercent(ciHalfWidth(active), 1)}` : ""}
          {" · "}
          {formatCost(active.cost, metric)}
          {onFrontier.has(active.runIndex) ? " · on frontier" : " · dominated"}
        </div>
      ) : null}
    </div>
  );
};
