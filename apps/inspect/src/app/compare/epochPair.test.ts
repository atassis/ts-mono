import { describe, expect, test } from "vitest";

import {
  defaultEpochPair,
  isEpochsMode,
  nextPickSide,
  resolveEpochPair,
} from "./epochPair";
import { EpochCell } from "./sampleGroups";

const cell = (epoch: number, mark: EpochCell["mark"]): EpochCell => ({
  epoch,
  key: `1#${epoch}`,
  mark,
});

describe("isEpochsMode", () => {
  test("true only when a and b are the same picked log", () => {
    expect(isEpochsMode("run1", "run1")).toBe(true);
    expect(isEpochsMode("run1", "run2")).toBe(false);
    expect(isEpochsMode(undefined, undefined)).toBe(false);
  });
});

describe("resolveEpochPair", () => {
  test("explicit params win", () => {
    expect(resolveEpochPair("2", "5", 1)).toEqual({ epochA: 2, epochB: 5 });
  });
  test("falls back to the sample's epoch when a param is missing", () => {
    expect(resolveEpochPair(undefined, "5", 3)).toEqual({
      epochA: 3,
      epochB: 5,
    });
    expect(resolveEpochPair("2", undefined, 3)).toEqual({
      epochA: 2,
      epochB: 3,
    });
  });
  test("falls back on a non-numeric param", () => {
    expect(resolveEpochPair("nope", "5", 3)).toEqual({
      epochA: 3,
      epochB: 5,
    });
  });
});

describe("defaultEpochPair", () => {
  test("first passing epoch vs first failing epoch", () => {
    const cells = [
      cell(1, "pass"),
      cell(2, "pass"),
      cell(3, "fail"),
      cell(4, "pass"),
    ];
    expect(defaultEpochPair(cells)).toEqual({ epochA: 1, epochB: 3 });
  });
  test("falls back to the first two epochs when nothing is mixed", () => {
    expect(defaultEpochPair([cell(1, "pass"), cell(2, "pass")])).toEqual({
      epochA: 1,
      epochB: 2,
    });
  });
  test("falls back to epochs 1 and 2 with fewer than two epochs", () => {
    expect(defaultEpochPair([cell(1, "pass")])).toEqual({
      epochA: 1,
      epochB: 2,
    });
    expect(defaultEpochPair([])).toEqual({ epochA: 1, epochB: 2 });
  });
  test("unsorted input is sorted by epoch first", () => {
    const cells = [cell(3, "fail"), cell(1, "pass")];
    expect(defaultEpochPair(cells)).toEqual({ epochA: 1, epochB: 3 });
  });
});

describe("nextPickSide", () => {
  test("alternates", () => {
    expect(nextPickSide("a")).toBe("b");
    expect(nextPickSide("b")).toBe("a");
  });
});
