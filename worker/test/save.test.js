import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { savePaidResult, PROGRAM } from "../../js/paid-mark.js";

function grade(partial) {
  return {
    testId: "test01",
    title: "Practice Test 1",
    complete: false,
    scoreValue: 2,
    scoreMax: 3,
    scorePct: 67,
    questions: [
      { q: 5, scoreValue: 2, scoreMax: 3, scorePct: 67, comment: "Partial answer." }
    ],
    ...partial
  };
}

describe("savePaidResult", () => {
  it("writes question rows and keeps an older full-test score", async () => {
    const posts = [];
    const packs = [];
    let stored = JSON.stringify({
      v: 1,
      tests: {
        test02: { questions: {}, full: { raw: 30, rawMax: 41, pct: 73, at: "2026-10-01" } },
        test01: { questions: {}, full: { raw: 20, rawMax: 41, pct: 49, at: "2026-10-02" } }
      }
    });
    const scores = {
      localDate: () => "2026-10-13",
      post: (fields) => {
        posts.push(fields);
        return Promise.resolve({ status: "ok" });
      }
    };
    const auth = {
      loadPack: async (program) => {
        assert.equal(program, PROGRAM);
        return { ok: true, found: true, progress_json: stored };
      },
      savePack: async (program, json) => {
        assert.equal(program, PROGRAM);
        packs.push(json);
        stored = json;
        return { ok: true, saved: true };
      }
    };
    const result = await savePaidResult(grade(), { scores, auth });
    assert.equal(result.ok, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].program, "speakpass");
    assert.equal(posts[0].itemId, "test01:q5");
    assert.equal(posts[0].scoreValue, 2);
    assert.equal(posts[0].scoreMax, 3);
    assert.equal(typeof posts[0].scorePct, "number");
    const saved = JSON.parse(packs[0]);
    assert.equal(saved.tests.test02.full.raw, 30);
    assert.equal(saved.tests.test01.full.raw, 20);
    assert.equal(saved.tests.test01.questions["5"].raw, 2);
    assert.equal(JSON.stringify(saved).includes("purchaseToken"), false);
  });

  it("writes the full-test row only when all 11 questions were graded", async () => {
    const posts = [];
    const questions = [];
    for (let q = 1; q <= 11; q += 1) {
      const max = q <= 2 ? 6 : q === 11 ? 5 : 3;
      questions.push({ q, scoreValue: 1, scoreMax: max, scorePct: 10, comment: "" });
    }
    const scores = {
      localDate: () => "2026-10-13",
      post: (fields) => {
        posts.push(fields);
        return Promise.resolve({ status: "ok" });
      }
    };
    const auth = {
      loadPack: async () => ({ ok: true, found: false, progress_json: "" }),
      savePack: async (_program, json) => ({ ok: true, saved: true, json })
    };
    const full = grade({
      complete: true,
      scoreValue: 11,
      scoreMax: 41,
      scorePct: 27,
      questions
    });
    const result = await savePaidResult(full, { scores, auth });
    assert.equal(result.ok, true);
    assert.equal(posts[0].itemId, "test01");
    assert.equal(posts[0].itemType, "full_test");
    assert.equal(posts[0].scoreMax, 41);
    assert.equal(posts.filter((row) => row.itemId.startsWith("test01:q")).length, 11);
  });

  it("does not save over a pack it could not load", async () => {
    let saved = false;
    const result = await savePaidResult(grade(), {
      scores: { post: () => Promise.resolve({ status: "ok" }) },
      auth: {
        loadPack: async () => ({ ok: false, error: "pack_not_loaded" }),
        savePack: async () => {
          saved = true;
          return { ok: true };
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(saved, false);
  });
});
