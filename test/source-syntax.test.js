import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("every application source file parses before changes can merge", () => {
  const sourceDir = path.resolve("src");
  const files = fs.readdirSync(sourceDir).filter(name => name.endsWith(".js"));
  assert.ok(files.length > 0, "expected application source files");
  for (const file of files) {
    const absolute = path.join(sourceDir, file);
    const result = spawnSync(process.execPath, ["--check", absolute], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file} has a JavaScript syntax error:\n${result.stderr}`);
  }
});
