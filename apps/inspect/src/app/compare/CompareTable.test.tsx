import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AlignedSample } from "./alignRuns";
import { CompareTable } from "./CompareTable";

const row = (
  key: string,
  category: AlignedSample["category"]
): AlignedSample => ({
  key,
  id: key,
  epoch: 1,
  category,
  valueA: "C",
  valueB: "I",
});

describe("CompareTable", () => {
  test("filters by category and reports selection", () => {
    const onSelect = vi.fn();
    render(
      <CompareTable
        rows={[row("x", "regressed"), row("y", "both-pass")]}
        selectedKey={undefined}
        onSelect={onSelect}
      />
    );
    expect(screen.getByText("x")).toBeTruthy();
    expect(screen.getByText("y")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Show"), {
      target: { value: "changed" },
    });
    expect(screen.queryByText("y")).toBeNull();

    fireEvent.click(screen.getByText("x"));
    expect(onSelect).toHaveBeenCalledWith("x");
  });
});
