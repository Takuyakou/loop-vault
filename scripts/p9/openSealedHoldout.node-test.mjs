import { test } from "node:test";
import assert from "node:assert/strict";
import { openSealedHoldout } from "./openSealedHoldout.mjs";
test("dev and validation callers cannot open the P9.7 holdout", async () => {
  await assert.rejects(openSealedHoldout({ stage: "P9.0", runId: "test" }), /SEALED_HOLDOUT_ACCESS_DENIED/);
  await assert.rejects(openSealedHoldout({ stage: "P9.7", runId: "" }), /SEALED_HOLDOUT_ACCESS_DENIED/);
});
