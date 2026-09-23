import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { replaceFile } from "../server/file-replace.js";

async function fixture(
  run: (temporary: string, destination: string) => Promise<void>,
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-replace-"));
  const destination = path.join(directory, "note.md");
  const temporary = path.join(directory, ".note.tmp");
  try {
    await fs.writeFile(destination, "old");
    await fs.writeFile(temporary, "new");
    await run(temporary, destination);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("a transient Windows reader does not lose the atomic replacement", () =>
  fixture(async (temporary, destination) => {
    let attempt = 0;
    await replaceFile(
      temporary,
      destination,
      Buffer.from("old"),
      async (from, to) => {
        if (++attempt === 1)
          throw Object.assign(new Error("busy"), { code: "EPERM" });
        await fs.rename(from, to);
      },
    );
    assert.equal(await fs.readFile(destination, "utf8"), "new");
    await assert.rejects(fs.access(temporary));
  }));

test("an external edit during contention is never overwritten by a retry", () =>
  fixture(async (temporary, destination) => {
    let attempts = 0;
    await assert.rejects(
      replaceFile(temporary, destination, Buffer.from("old"), async () => {
        attempts++;
        await fs.writeFile(destination, "external change");
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      }),
      /original file changed/,
    );
    assert.equal(attempts, 1);
    assert.equal(await fs.readFile(destination, "utf8"), "external change");
    assert.equal(await fs.readFile(temporary, "utf8"), "new");
  }));

test("permanent errors preserve both files without repeated writes", () =>
  fixture(async (temporary, destination) => {
    let attempts = 0;
    await assert.rejects(
      replaceFile(temporary, destination, Buffer.from("old"), async () => {
        attempts++;
        throw Object.assign(new Error("disk error"), { code: "EIO" });
      }),
      /disk error/,
    );
    assert.equal(attempts, 1);
    assert.equal(await fs.readFile(destination, "utf8"), "old");
    assert.equal(await fs.readFile(temporary, "utf8"), "new");
  }));
