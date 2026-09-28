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
