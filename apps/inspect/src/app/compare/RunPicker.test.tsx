import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Log } from "../../client/api/types";

import { RunPicker } from "./RunPicker";

const log = (overrides: Partial<Log> & Pick<Log, "name">): Log => ({
  task: null,
  task_id: null,
  mtime: null,
  depth: "listed",
  preview_attempts: 0,
  details_attempts: 0,
  details_settled_seq: 0,
  ...overrides,
});

describe("RunPicker", () => {
  test("shows a placeholder when nothing is selected, then filters and selects", () => {
    const onSelect = vi.fn();
    const logs = [
      log({ name: "a.eval", model: "openai/gpt-4o", task: "bench" }),
      log({ name: "b.eval", model: "mistral/small", task: "bench" }),
    ];
    render(
      <RunPicker
        id="picker"
        ariaLabel="Log A"
        logs={logs}
        logDir="file:///logs"
        selected={undefined}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByLabelText("Log A"));
    expect(screen.getByText("openai/gpt-4o")).toBeTruthy();
    expect(screen.getByText("mistral/small")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Log A search"), {
      target: { value: "mistral" },
    });
    expect(screen.queryByText("openai/gpt-4o")).toBeNull();

    fireEvent.click(screen.getByText("mistral/small"));
    expect(onSelect).toHaveBeenCalledWith(logs[1]);
  });

  test("opening one picker closes a sibling picker already open", () => {
    // Regression: the open menu used to render a full-viewport backdrop,
    // which physically covered every other trigger on the page. Clicking
    // straight from an open A picker to B's trigger hit A's backdrop and
    // only closed A, instead of also opening B.
    const logsA = [log({ name: "a.eval", model: "openai/gpt-4o" })];
    const logsB = [log({ name: "b.eval", model: "mistral/small" })];
    const { container } = render(
      <>
        <RunPicker
          id="picker-a"
          ariaLabel="Picker A"
          logs={logsA}
          logDir="file:///logs"
          selected={undefined}
          onSelect={vi.fn()}
        />
        <RunPicker
          id="picker-b"
          ariaLabel="Picker B"
          logs={logsB}
          logDir="file:///logs"
          selected={undefined}
          onSelect={vi.fn()}
        />
      </>
    );
    const scoped = within(container);

    fireEvent.click(scoped.getByLabelText("Picker A"));
    expect(screen.getByRole("listbox", { name: "Picker A" })).toBeTruthy();

    fireEvent.mouseDown(scoped.getByLabelText("Picker B"));
    fireEvent.click(scoped.getByLabelText("Picker B"));

    expect(screen.queryByRole("listbox", { name: "Picker A" })).toBeNull();
    expect(screen.getByRole("listbox", { name: "Picker B" })).toBeTruthy();
  });

  test("closed picker shows the selected run", () => {
    const selected = log({
      name: "a.eval",
      model: "openai/gpt-4o",
      task: "bench",
    });
    render(
      <RunPicker
        id="picker"
        ariaLabel="Log A"
        logs={[selected]}
        logDir="file:///logs"
        selected={selected}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("openai/gpt-4o")).toBeTruthy();
  });
});
