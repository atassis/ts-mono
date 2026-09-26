/**
 * Tests for the logsContent IndexedDB + cache seam (fake-indexeddb, like
 * database.test.ts).
 */
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Log } from "../client/api/types";
import { DB_NAME } from "../client/database/schema";
import {
  createDatabaseService,
  DatabaseService,
} from "../client/database/service";
import { queryClient } from "../state/queryClient";

import {
  clearFile,
  getLogRows,
  mergeRows,
  setRows,
  writeListing,
  writePreviews,
} from "./logsContent";

const row = (name: string): Log => ({
  name,
  depth: "listed",
  preview_attempts: 0,
  details_attempts: 0,
  details_settled_seq: 0,
});

const invalidateListings = vi.hoisted(() => vi.fn());
vi.mock("./databaseListings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./databaseListings")>()),
  invalidateDatabaseLogsListings: invalidateListings,
}));

describe("writeListing", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = createDatabaseService();
    await db.openDatabase();
  });

  afterEach(async () => {
    queryClient.clear();
    await db.closeDatabase();
    await Dexie.delete(DB_NAME);
  });

  test("persists and reads back rows in the dir's namespace", async () => {
    const rows = await writeListing(db, "file:///logs", [
      { name: "file:///logs/a.eval" },
    ]);

    expect(rows.map((row) => row.name)).toEqual(["file:///logs/a.eval"]);
    expect(await db.readLogs({ prefix: "file:///logs" })).toHaveLength(1);
    expect((await db.getSyncScope("file:///logs"))?.last_synced).toBeDefined();
  });

  test("degrades to cache-only when names are outside the dir's namespace", async () => {
    // An older view server: aliased-path log_dir, file:// URI names.
    const rows = await writeListing(db, "~/logs", [
      { name: "file:///home/me/logs/a.eval" },
    ]);

    // The listing still lands (cache) instead of being blanked by an empty
    // scoped read-back...
    expect(rows.map((row) => row.name)).toEqual([
      "file:///home/me/logs/a.eval",
    ]);
    // ...and nothing was persisted where no scoped read could reach it.
    expect(await db.readLogs({ prefix: "~/logs" })).toHaveLength(0);
    expect(await db.getSyncScope("~/logs")).toBeUndefined();
  });
});

describe("mergeRows", () => {
  afterEach(() => {
    queryClient.clear();
  });

  // Regression for the beginFetch cache-hit path calling seedRows([cached])
  // (a full-collection replace) instead of a merge — one hit collapsed the
  // whole directory listing down to that one row.
  test("upserts one row without dropping the rest of the collection", () => {
    setRows("/logs", [row("/logs/a.eval"), row("/logs/b.eval")]);

    mergeRows("/logs", { "/logs/a.eval": { status: "success" } });

    const rows = getLogRows("/logs");
    expect(rows.map((r) => r.name)).toEqual(["/logs/a.eval", "/logs/b.eval"]);
    expect(rows.find((r) => r.name === "/logs/a.eval")?.status).toBe("success");
  });

  test("appends a row for a name outside the current collection", () => {
    setRows("/logs", [row("/logs/a.eval")]);

    mergeRows("/logs", { "/logs/b.eval": { status: "success" } });

    expect(getLogRows("/logs").map((r) => r.name)).toEqual([
      "/logs/a.eval",
      "/logs/b.eval",
    ]);
  });
});

describe("db-less write invalidation", () => {
  // Listing queries in db-less sessions read from the react-query cache and
  // only refetch on invalidation — so every cache-updating write must fire
  // it, not just the persisted ones.
  beforeEach(() => {
    invalidateListings.mockClear();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test("a db-less preview merge refreshes the listings", async () => {
    await writePreviews(null, "/plain/logs", {});
    expect(invalidateListings).toHaveBeenCalled();
  });

  test("a db-less file clear refreshes the listings", async () => {
    await clearFile(null, "/plain/logs", "/plain/logs/a.eval");
    expect(invalidateListings).toHaveBeenCalled();
  });
});
