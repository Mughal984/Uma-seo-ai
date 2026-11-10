import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSelfRepairEngine } from "../src/self-repair.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uma-self-repair-"));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "sample.js"), "export const value = 1;\n");
  return root;
}

test("applies a proposed source repair only when project tests pass and keeps a backup", async () => {
  const root = await fixture();
  const engine = createSelfRepairEngine({
    root,
    generateText: async () => ({ text: JSON.stringify({ files: { "src/sample.js": "export const value = 2;\n" } }) }),
    runTests: async () => ({ passed: true, reason: "tests_passed" })
  });
  const result = await engine.repair({ diagnostics: "A known safe issue" });
  assert.equal(result.applied, true);
  assert.equal(await fs.readFile(path.join(root, "src/sample.js"), "utf8"), "export const value = 2;\n");
  assert.ok((await fs.readdir(path.join(root, result.backupDirectory, "src"))).includes("sample.js"));
});

test("rolls back source changes when tests fail", async () => {
  const root = await fixture();
  const original = await fs.readFile(path.join(root, "src/sample.js"), "utf8");
  const engine = createSelfRepairEngine({
    root,
    generateText: async () => ({ text: JSON.stringify({ files: { "src/sample.js": "export const value = 3;\n" } }) }),
    runTests: async () => ({ passed: false, reason: "tests_failed" })
  });
  const result = await engine.repair({ diagnostics: "A risky repair" });
  assert.equal(result.applied, false);
  assert.equal(result.rolledBack, true);
  assert.equal(await fs.readFile(path.join(root, "src/sample.js"), "utf8"), original);
});

test("rejects edits outside the narrow src JavaScript allowlist", async () => {
  const root = await fixture();
  const engine = createSelfRepairEngine({
    root,
    generateText: async () => ({ text: JSON.stringify({ files: { ".env": "SECRET=bad" } }) }),
    runTests: async () => ({ passed: true })
  });
  await assert.rejects(engine.repair({ diagnostics: "Try to edit secrets" }), /disallowed path/);
  assert.equal(await fs.readFile(path.join(root, ".env"), "utf8").catch(() => ""), "");
});

test("does not apply an empty or unsafe model proposal", async () => {
  const root = await fixture();
  const engine = createSelfRepairEngine({
    root,
    generateText: async () => ({ text: JSON.stringify({ files: {} }) })
  });
  const result = await engine.repair({ diagnostics: "Nothing to safely repair" });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no_safe_patch_proposed");
});
