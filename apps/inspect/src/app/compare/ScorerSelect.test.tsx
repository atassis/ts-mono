import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ScorerSelect } from "./ScorerSelect";

afterEach(cleanup);

describe("ScorerSelect", () => {
  test("shows one-sided scorers disabled, with the side that has them", () => {
    render(
      <ScorerSelect
        options={[
          { name: "match", inA: true, inB: true },
          { name: "f1", inA: true, inB: false },
          { name: "judge", inA: false, inB: true },
        ]}
        selected="match"
        onSelect={vi.fn()}
      />
    );
    const option = (name: RegExp): HTMLOptionElement => {
      const el = screen.getByRole("option", { name });
      if (!(el instanceof HTMLOptionElement)) throw new Error("not an option");
      return el;
    };
    expect(option(/^match$/).disabled).toBe(false);
    expect(option(/f1 \(only in A\)/).disabled).toBe(true);
    expect(option(/judge \(only in B\)/).disabled).toBe(true);
  });

  test("reports the picked scorer", () => {
    const onSelect = vi.fn();
    render(
      <ScorerSelect
        options={[
          { name: "match", inA: true, inB: true },
          { name: "judge", inA: true, inB: true },
        ]}
        selected="match"
        onSelect={onSelect}
      />
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "judge" },
    });
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
