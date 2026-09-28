import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AlignedSample, sampleKey } from "./alignRuns";
import { CompareTable } from "./CompareTable";

afterEach(cleanup);

const summary = (id: string, epoch: number) => ({
  id,
  epoch,
  input: "",
  target: "",
  metadata: {},
  completed: true,
  model_usage: {},
  role_usage: {},
});

const row = (
  id: string,
  epoch: number,
  valueA: string,
  valueB: string
): AlignedSample => ({
  key: sampleKey(id, epoch),
  id,
  epoch,
  a: summary(id, epoch),
  b: summary(id, epoch),
  valueA,
  valueB,
  category: "unchanged",
});

const rows = [
  row("x", 1, "C", "C"),
  row("x", 2, "C", "I"),
  row("y", 1, "C", "C"),
];

describe("CompareTable", () => {
  test("one row per sample; filters by sample outcome", () => {
    render(
      <CompareTable rows={rows} selectedKey={undefined} onSelect={vi.fn()} />
    );
    expect(screen.getByText("x")).toBeTruthy();
    expect(screen.getByText("y")).toBeTruthy();
    expect(screen.getAllByText("x")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Show"), {
      target: { value: "changed" },
    });
    expect(screen.queryByText("y")).toBeNull();
  });

  test("the row opens the first epoch where A and B disagree", () => {
    const onSelect = vi.fn();
    render(
      <CompareTable rows={rows} selectedKey={undefined} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("x"));
    expect(onSelect).toHaveBeenCalledWith("x#2");
  });

  test("an epoch mark opens that epoch", () => {
    const onSelect = vi.fn();
    render(
      <CompareTable rows={rows} selectedKey={undefined} onSelect={onSelect} />
    );
    const [mark] = screen.getAllByRole("button", { name: "A epoch 1: pass" });
    if (mark) fireEvent.click(mark);
    expect(onSelect).toHaveBeenCalledWith("x#1");
  });
});

describe("CompareTable epochs mode", () => {
  // Same log on both sides: alignRuns pairs every row with itself, so a and
  // b are identical — this is what ComparePage feeds the table when a == b.
  const epochsRows = [
    row("x", 1, "C", "C"),
    row("x", 2, "I", "I"),
    row("y", 1, "C", "C"),
  ];

  test("one strip per sample, not two", () => {
    render(
      <CompareTable
        rows={epochsRows}
        selectedKey={undefined}
        onSelect={vi.fn()}
        epochsMode
      />
    );
    // 3 rows total across "x" (epochs 1,2) and "y" (epoch 1) — one strip
    // per sample means 3 marks, not 6.
    const marks = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("title")?.startsWith("Epoch epoch"));
    expect(marks).toHaveLength(3);
    expect(screen.getByRole("columnheader", { name: "Epochs" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "A" })).toBeNull();
  });

  test("outcome reads as a tally, not improved/regressed", () => {
    render(
      <CompareTable
        rows={epochsRows}
        selectedKey={undefined}
        onSelect={vi.fn()}
        epochsMode
      />
    );
    // "1/2" appears twice: once in the epoch strip's own tally, once as the
    // outcome cell's text — assert both are there instead of picking one.
    expect(screen.getAllByText("1/2")).toHaveLength(2);
    expect(screen.getByText("· flaky")).toBeTruthy();
  });

  test("an epoch mark calls onPickEpoch, not onSelect", () => {
    const onSelect = vi.fn();
    const onPickEpoch = vi.fn();
    render(
      <CompareTable
        rows={epochsRows}
        selectedKey={undefined}
        onSelect={onSelect}
        epochsMode
        onPickEpoch={onPickEpoch}
      />
    );
    const [mark] = screen.getAllByRole("button", {
      name: "Epoch epoch 1: pass",
    });
    if (mark) fireEvent.click(mark);
    expect(onPickEpoch).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
