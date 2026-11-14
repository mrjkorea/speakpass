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

describe("mark record", () => {
  function stub(packJsonText) {
    const state = { pack: packJsonText || "", saved: [] };
    const scores = {
      localDate: () => "2026-11-14",
      post: () => Promise.resolve({ status: "ok" })
    };
    const auth = {
      loadPack: async () => ({ ok: true, found: !!state.pack, progress_json: state.pack }),
      savePack: async (program, json) => {
        state.saved.push(json);
        state.pack = json;
        return { ok: true, saved: true };
      }
    };
    return { state, deps: { scores, auth } };
  }

  const test = {
    id: "test01",
    questions: [
      { q: 5, question: "How often do you cook at home?" },
      { q: 11, question: "Are flexible work hours a good idea?" }
    ]
  };

  it("keeps the question, the student's words and the tokens", async () => {
    const { state, deps } = stub();
    const attempt = {
      testId: "test01",
      mode: "class",
      answers: [{ q: 5, type: "respond_questions", transcript: "I cook at home five nights a week." }]
    };
    const grade = {
      testId: "test01",
      timing: { tokensIn: 1518, tokensOut: 96 },
      questions: [{
        q: 5,
        scoreValue: 2,
        scoreMax: 3,
        scorePct: 67,
        band: 2,
        comment: "Direct answer with one detail.",
        tip: "Add one dish you make.",
        corrected: "I cook at home five nights a week."
      }]
    };
    const res = await savePaidResult(grade, { ...deps, attempt, test });
    assert.equal(res.ok, true);
    const saved = JSON.parse(state.pack);
    assert.equal(saved.markLog.length, 1);
    const entry = saved.markLog[0];
    assert.equal(entry.test, "test01");
    assert.equal(entry.mode, "class");
    assert.equal(entry.date, "2026-11-14");
    assert.equal(entry.tin, 1518);
    assert.equal(entry.tout, 96);
    assert.equal(entry.qs.length, 1);
    assert.equal(entry.qs[0].q, 5);
    assert.equal(entry.qs[0].question, "How often do you cook at home?");
    assert.equal(entry.qs[0].tx, "I cook at home five nights a week.");
    assert.equal(entry.qs[0].band, 2);
    assert.equal(entry.qs[0].max, 3);
    assert.equal(entry.qs[0].comment, "Direct answer with one detail.");
    assert.equal(entry.qs[0].tip, "Add one dish you make.");
    assert.equal(typeof entry.qs[0].corrected, "string");
  });

  it("keeps the newest 40 records only", async () => {
    const old = [];
    for (let i = 0; i < 40; i += 1) {
      old.push({ at: `2026-10-01T00:00:${String(i).padStart(2, "0")}.000Z`, test: "test01", mode: "class", qs: [{ q: 5, band: 1, max: 3, tx: "old" }] });
    }
    const { state, deps } = stub(JSON.stringify({ v: 1, tests: {}, items: {}, attempts: [], markLog: old }));
    const grade = { testId: "test01", questions: [{ q: 11, scoreValue: 3, scoreMax: 5, scorePct: 60, band: 3 }] };
    await savePaidResult(grade, { ...deps, attempt: { testId: "test01", mode: "class", answers: [{ q: 11, transcript: "new answer" }] }, test });
    const saved = JSON.parse(state.pack);
    assert.equal(saved.markLog.length, 40);
    assert.equal(saved.markLog[39].qs[0].tx, "new answer");
    assert.equal(saved.markLog[0].at, "2026-10-01T00:00:01.000Z");
  });

  it("keeps the pack under the size limit by dropping the oldest record", async () => {
    const big = [];
    for (let i = 0; i < 40; i += 1) {
      big.push({
        at: `2026-10-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        test: "test01",
        mode: "class",
        qs: [{ q: 5, band: 1, max: 3, tx: "x".repeat(1200), comment: "c".repeat(200), corrected: "d".repeat(400) }]
      });
    }
    const { state, deps } = stub(JSON.stringify({ v: 1, tests: {}, items: {}, attempts: [], markLog: big }));
    const grade = { testId: "test01", questions: [{ q: 11, scoreValue: 3, scoreMax: 5, scorePct: 60, band: 3 }] };
    await savePaidResult(grade, { ...deps, attempt: { testId: "test01", mode: "class", answers: [{ q: 11, transcript: "new answer" }] }, test });
    assert.ok(state.pack.length <= 45000, `pack is ${state.pack.length}`);
    const saved = JSON.parse(state.pack);
    assert.equal(saved.markLog[saved.markLog.length - 1].qs[0].tx, "new answer");
  });
});
