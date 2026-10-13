import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { CAPS, memoryKv } from "../src/limits.js";
import { paymentMode } from "../src/mode.js";

const FREE = {
  GRADE_API_KEY: "test-key",
  SIGNIN_ENDPOINT: "https://signin.example/exec",
  ALLOWED_ORIGINS: "https://mrjkorea.github.io"
};

const NOW = 1_700_000_000;

function post(body) {
  return new Request("https://grade.example/grade", {
    method: "POST",
    headers: { Origin: "https://mrjkorea.github.io", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function gradeBody(studentId, token) {
  return {
    testId: "test01",
    studentId,
    token: token || "tok",
    answers: [{ q: 5, transcript: "I cook rice at home." }]
  };
}

function modelReply() {
  return Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          questions: [{ q: 5, score: 2, comment: "A short answer." }]
        })
      }
    }]
  });
}

describe("payment mode", () => {
  it("defaults to free and accepts play as the other setting", () => {
    assert.equal(paymentMode({}), "free");
    assert.equal(paymentMode({ PAYMENT_MODE: "FREE" }), "free");
    assert.equal(paymentMode({ PAYMENT_MODE: "play" }), "play");
    assert.equal(paymentMode({ PAYMENT_MODE: "other" }), "free");
  });
});

describe("free grades", () => {
  it("refuses a bad session and does not call the model or Play", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return Response.json({ ok: false });
    };
    const response = await handle(post(gradeBody("mina", "bad")), FREE, {
      fetch: fetchImpl,
      now: NOW,
      kv: memoryKv()
    });
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error, "sign_in");
    assert.equal(calls.some((url) => url.includes("api.deepseek.com")), false);
    assert.equal(calls.some((url) => url.includes("androidpublisher")), false);
    assert.equal(calls.some((url) => url.includes("signin.example")), true);
  });

  it("grades a signed-in student and skips Play", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes("signin.example")) {
        return Response.json({ ok: true, id: "Mina Park" });
      }
      return modelReply();
    };
    const response = await handle(post(gradeBody("mina park")), FREE, {
      fetch: fetchImpl,
      now: NOW,
      kv: memoryKv()
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.questions[0].scoreValue, 2);
    assert.equal(calls.some((url) => url.includes("androidpublisher")), false);
    assert.equal(calls.some((url) => url.includes("api.deepseek.com")), true);
  });

  it("stops a student after the daily personal cap and does not call the model", async () => {
    const kv = memoryKv();
    let modelCalls = 0;
    const fetchImpl = async (url) => {
      if (String(url).includes("api.deepseek.com")) {
        modelCalls += 1;
        return modelReply();
      }
      return Response.json({ ok: true, id: "mina" });
    };
    for (let i = 0; i < CAPS.studentPerDay; i += 1) {
      const response = await handle(post(gradeBody("mina")), FREE, {
        fetch: fetchImpl,
        now: NOW + i * CAPS.minGapSeconds,
        kv
      });
      assert.equal(response.status, 200);
    }
    const before = modelCalls;
    const blocked = await handle(post(gradeBody("mina")), FREE, {
      fetch: fetchImpl,
      now: NOW + CAPS.studentPerDay * CAPS.minGapSeconds,
      kv
    });
    const payload = await blocked.json();
    assert.equal(blocked.status, 429);
    assert.equal(payload.error, "student_cap");
    assert.equal(modelCalls, before);
  });

  it("asks the same student to wait between marks", async () => {
    const kv = memoryKv();
    let modelCalls = 0;
    const fetchImpl = async (url) => {
      if (String(url).includes("api.deepseek.com")) {
        modelCalls += 1;
        return modelReply();
      }
      return Response.json({ ok: true, id: "mina" });
    };
    const first = await handle(post(gradeBody("mina")), FREE, { fetch: fetchImpl, now: NOW, kv });
    assert.equal(first.status, 200);
    const second = await handle(post(gradeBody("mina")), FREE, {
      fetch: fetchImpl,
      now: NOW + CAPS.minGapSeconds - 1,
      kv
    });
    const payload = await second.json();
    assert.equal(second.status, 429);
    assert.equal(payload.error, "slow_down");
    assert.equal(modelCalls, 1);
  });

  it("stops the whole day after the total cap", async () => {
    const kv = memoryKv();
    let modelCalls = 0;
    const fetchImpl = async (url, init) => {
      if (String(url).includes("api.deepseek.com")) {
        modelCalls += 1;
        return modelReply();
      }
      const sent = JSON.parse(init.body);
      return Response.json({ ok: true, id: sent.id });
    };
    for (let i = 0; i < CAPS.dailyTotal; i += 1) {
      const response = await handle(post(gradeBody(`student-${i}`)), FREE, {
        fetch: fetchImpl,
        now: NOW,
        kv
      });
      assert.equal(response.status, 200);
    }
    const before = modelCalls;
    const blocked = await handle(post(gradeBody("one-more")), FREE, {
      fetch: fetchImpl,
      now: NOW,
      kv
    });
    const payload = await blocked.json();
    assert.equal(blocked.status, 429);
    assert.equal(payload.error, "daily_cap");
    assert.equal(modelCalls, before);
  });
});
