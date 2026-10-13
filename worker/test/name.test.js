import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;

function filesUnder(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, out);
    else out.push(path);
  }
  return out;
}

describe("student app", () => {
  it("does not name the grader", () => {
    const paths = [
      ...filesUnder(join(ROOT, "js"), []),
      ...filesUnder(join(ROOT, "locales"), []),
      join(ROOT, "index.html"),
      join(ROOT, "sw.js"),
      join(ROOT, "manifest.webmanifest")
    ];
    for (const path of paths) {
      const text = readFileSync(path, "utf8");
      assert.equal(/deepseek/i.test(text), false, path);
    }
  });
});
