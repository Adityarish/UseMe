import assert from "node:assert/strict";
import { expiryFor, isUnavailable, safeFilename, validateSlug } from "../src/lib/domain.ts";
import { validatedUploadStream } from "../src/lib/upload-stream.ts";

assert.equal(validateSlug("Project Notes"), "project-notes");
assert.throws(() => validateSlug("dashboard"), /reserved/i);
assert.equal(expiryFor("FOREVER"), null);
assert.equal(isUnavailable({ status: "ACTIVE", expiresAt: new Date(Date.now() - 1) }), true);
assert.equal(safeFilename("../../secret.txt"), "secret.txt");

const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
const read = validatedUploadStream(new Blob([pdf]).stream(), pdf.length, "application/pdf");
assert.deepEqual(new Uint8Array(await new Response(read).arrayBuffer()), pdf);

const mismatch = validatedUploadStream(new Blob([Uint8Array.from([1, 2, 3, 4])]).stream(), 4, "application/pdf");
await assert.rejects(() => new Response(mismatch).arrayBuffer(), /does not match/i);

console.log("Core dependency-free checks passed.");
