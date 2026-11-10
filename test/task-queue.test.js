import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionTaskStatus } from "../src/task-queue.js";

test("allows an owner to approve or dismiss a proposed SEO task", () => {
  assert.equal(canTransitionTaskStatus("proposed", "approved"), true);
  assert.equal(canTransitionTaskStatus("proposed", "dismissed"), true);
});

test("prevents changing a task after its first review", () => {
  assert.equal(canTransitionTaskStatus("approved", "dismissed"), false);
  assert.equal(canTransitionTaskStatus("dismissed", "approved"), false);
  assert.equal(canTransitionTaskStatus("approved", "approved"), false);
});
