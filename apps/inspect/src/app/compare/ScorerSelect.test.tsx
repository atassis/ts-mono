import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ScorerOption } from "./alignRuns";
import { ScorerSelect } from "./ScorerSelect";

afterEach(cleanup);

const options: ScorerOption[] = [
  {
    name: "match",
    inA: true,
    inB: true,
    statA: { mean: 0.9, n: 10 },
    statB: { mean: 0.8, n: 10 },
  },
  { name: "f1", inA: true, inB: false, statA: { mean: 0.5, n: 10 } },
  { name: "judge", inA: true, inB: true },
];

const openMenu = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Scorer" }));
};

describe("ScorerSelect", () => {
  test("lists one-sided scorers as disabled, naming the missing side", () => {
    render(
      <ScorerSelect options={options} selected="match" onSelect={vi.fn()} />
    );
    openMenu();
    const rows = screen.getAllByRole("option");
    expect(rows.map((r) => r.getAttribute("aria-disabled"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(rows[1]?.textContent).toContain("not in B");
  });

  test("shows each side's mean and sample count", () => {
    render(
      <ScorerSelect options={options} selected="match" onSelect={vi.fn()} />
    );
    openMenu();
    expect(screen.getAllByRole("option")[0]?.textContent).toMatch(
      /0\.9 \(10\).*0\.8 \(10\)/
    );
  });

  test("picks a comparable scorer, ignores a one-sided one", () => {
    const onSelect = vi.fn();
    render(
      <ScorerSelect options={options} selected="match" onSelect={onSelect} />
    );
    openMenu();
    fireEvent.click(screen.getByText("f1"));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("judge"));
    expect(onSelect).toHaveBeenCalledWith("judge");
  });

  test("arrow keys skip one-sided scorers", () => {
    const onSelect = vi.fn();
    render(
      <ScorerSelect options={options} selected="match" onSelect={onSelect} />
    );
    openMenu();
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("judge");
  });

  test("warns when the runs share no scorer", () => {
    render(
      <ScorerSelect
        options={[{ name: "f1", inA: true, inB: false }]}
        selected={undefined}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /no scorer in common/
    );
  });
});
