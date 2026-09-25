import { fireEvent, render, screen } from "@testing-library/react";
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
