import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestAiMark, workerUrl } from "../../js/mark-client.js";

function attempt() {
  return {
    testId: "test01",
    answers: [
      { q: 5, transcript: "I cook rice at home." },
      { q: 6, transcript: "   " }
    ]
  };
}

function auth() {
  return {
    student: () => "mina",
    token: () => "tok",
    loadPack: async () => ({ ok: true, found: false, progress_json: "" }),
    savePack: async () => ({ ok: true, saved: true })
  };
}

describe("mark client", () => {
  it("does not fetch when the Worker address is empty", async () => {
    let called = false;
    const result = await requestAiMark(attempt(), {
      url: "  ",
      fetch: async () => {
        called = true;
        return Response.json({});
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "not_deployed");
    assert.equal(called, false);
    assert.equal(workerUrl(""), "");
  });

  it("saves a successful mark with the shared score client", async () => {
    const posts = [];
    let sent = null;
    const result = await requestAiMark(attempt(), {
      url: "https://grade.example/grade",
      auth: auth(),
      scores: {
        localDate: () => "2026-10-13",
        post: (fields) => {
          posts.push(fields);
          return Promise.resolve({ status: "ok" });
        }
      },
      fetch: async (url, init) => {
        sent = { url: String(url), body: JSON.parse(init.body) };
        return Response.json({
          ok: true,
          testId: "test01",
          title: "Practice Test 1",
          complete: false,
          scoreValue: 2,
          scoreMax: 3,
          scorePct: 67,
          questions: [{ q: 5, scoreValue: 2, scoreMax: 3, scorePct: 67, comment: "A short answer." }]
        });
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.saved, true);
    assert.equal(sent.url, "https://grade.example/grade");
    assert.equal(sent.body.studentId, "mina");
    assert.equal(sent.body.token, "tok");
    assert.deepEqual(sent.body.answers, [{ q: 5, transcript: "I cook rice at home." }]);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].program, "speakpass");
    assert.equal(posts[0].itemId, "test01:q5");
    assert.equal(posts[0].scoreValue, 2);
  });

  it("treats a missing Worker as not deployed", async () => {
    const result = await requestAiMark(attempt(), {
      url: "https://grade.example/grade",
      auth: auth(),
      fetch: async () => new Response("missing", { status: 404 })
    });
    assert.equal(result.error, "not_deployed");
  });
});
