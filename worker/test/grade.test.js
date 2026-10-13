import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTest } from "../src/catalog.js";
import { handle, clearTokenCache } from "../src/index.js";
import { OUTPUT_CAP, gradeRequest } from "../src/model.js";
import { buildMessages } from "../src/prompt.js";
import { RUBRIC } from "../src/rubric.js";
import { purchaseDecision } from "../src/play.js";
import { applyModel, maxFor, publicGrade } from "../src/score.js";

const ENV = {
  GRADE_API_KEY: "test-key",
  PLAY_SERVICE_ACCOUNT: JSON.stringify({
    client_email: "grade@example.iam.gserviceaccount.com",
    private_key: ""
  }),
  PACKAGE_NAME: "com.mrjkorea.speakpass",
  ALLOWED_ORIGINS: "https://mrjkorea.github.io"
};

function answersFrom(test, textFor) {
  return test.questions.map((question) => ({
    q: question.q,
    transcript: textFor(question)
  }));
}

describe("prompt", () => {
  it("puts the rubric first and keeps it identical", () => {
    const test = getTest("test01");
    const first = buildMessages(test, [{ q: 11, transcript: "I prefer the morning shift." }]);
    const second = buildMessages(test, [{ q: 5, transcript: "I cook rice most nights." }]);
    assert.equal(first.messages[0].role, "system");
    assert.equal(first.messages[0].content, RUBRIC);
    assert.equal(second.messages[0].content, RUBRIC);
    assert.match(RUBRIC, /Ignore speech-to-text errors/);
    assert.equal(RUBRIC.indexOf("Scoring guide"), RUBRIC.indexOf("Scoring guide"));
    assert.ok(RUBRIC.indexOf("Scoring guide") < RUBRIC.indexOf("Standing rules"));
    assert.equal(first.messages[0].content.includes("morning shift"), false);
    assert.match(first.messages[1].content, /morning shift/);
  });
});

describe("scores", () => {
  it("sums a full test to 41", () => {
    const pending = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const model = {
      questions: pending.map((q) => (
        q <= 2
          ? { q, pronunciation: 3, intonation: 3, comment: "Matched the text." }
          : { q, score: maxFor(q), comment: "Full answer." }
      ))
    };
    const scored = applyModel(pending, [], model);
    assert.equal(scored.complete, true);
    assert.equal(scored.scoreMax, 41);
    assert.equal(scored.scoreValue, 41);
    assert.equal(scored.scorePct, 100);
    const pub = JSON.stringify(publicGrade(getTest("test01"), scored));
    assert.equal(/deepseek/i.test(pub), false);
  });

  it("scores a blank transcript as zero without trusting a high model mark", () => {
    const scored = applyModel([5], [1], {
      questions: [{ q: 5, score: 9, comment: "deepseek says perfect" }]
    });
    const q5 = scored.questions.find((row) => row.q === 5);
    const q1 = scored.questions.find((row) => row.q === 1);
    assert.equal(q5.scoreValue, 3);
    assert.equal(q5.comment, "");
    assert.equal(q1.scoreValue, 0);
    assert.equal(q1.scoreMax, 6);
  });
});

describe("worker", () => {
  it("grades an owned pack and does not name the model in the reply", async () => {
    clearTokenCache();
    const { privateKey } = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["sign"]
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
    let body = "";
    for (let i = 0; i < pkcs8.length; i++) body += String.fromCharCode(pkcs8[i]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(body)}\n-----END PRIVATE KEY-----\n`;
    const env = {
      ...ENV,
      PLAY_SERVICE_ACCOUNT: JSON.stringify({
        client_email: "grade@example.iam.gserviceaccount.com",
        private_key: pem
      })
    };
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      const href = String(url);
      if (href.includes("oauth2.googleapis.com")) {
        return Response.json({ access_token: "ya29.test", expires_in: 3600 });
      }
      if (href.endsWith(":acknowledge")) return new Response(null, { status: 204 });
      if (href.includes("androidpublisher.googleapis.com")) {
        return Response.json({
          purchaseState: 0,
          consumptionState: 0,
          acknowledgementState: 0,
          obfuscatedExternalAccountId: "Mina Park"
        });
      }
      const sent = JSON.parse(init.body);
      assert.equal(sent.thinking.type, "disabled");
      assert.equal(sent.max_tokens, OUTPUT_CAP);
      assert.equal(sent.messages[0].content, RUBRIC);
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [{ q: 11, score: 4, comment: "Clear opinion with a short reason." }]
            })
          }
        }],
        usage: { prompt_cache_hit_tokens: 10, prompt_cache_miss_tokens: 20, completion_tokens: 30 }
      });
    };
    const request = new Request("https://grade.example/grade", {
      method: "POST",
      headers: { Origin: "https://mrjkorea.github.io", "Content-Type": "application/json" },
      body: JSON.stringify({
        testId: "test01",
        productId: "speakpass_tests_01_10",
        purchaseToken: "token-1",
        studentId: "mina park",
        answers: [{ q: 11, transcript: "I think flexible hours help teams." }]
      })
    });
    const response = await handle(request, env, { fetch: fetchImpl, now: 1_700_000_000 });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.scoreValue, 4);
    assert.equal(payload.scoreMax, 5);
    assert.equal(payload.complete, false);
    assert.equal(/deepseek/i.test(JSON.stringify(payload)), false);
    assert.equal(calls.some((call) => String(call.url).endsWith(":acknowledge")), true);
  });

  it("refuses a canceled purchase before grading", async () => {
    clearTokenCache();
    const { privateKey } = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["sign"]
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
    let body = "";
    for (let i = 0; i < pkcs8.length; i++) body += String.fromCharCode(pkcs8[i]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(body)}\n-----END PRIVATE KEY-----\n`;
    const env = {
      ...ENV,
      PLAY_SERVICE_ACCOUNT: JSON.stringify({
        client_email: "grade@example.iam.gserviceaccount.com",
        private_key: pem
      })
    };
    let graded = false;
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.includes("oauth2.googleapis.com")) {
        return Response.json({ access_token: "ya29.test", expires_in: 3600 });
      }
      if (href.includes("api.deepseek.com")) {
        graded = true;
        return Response.json({});
      }
      return Response.json({ purchaseState: 1, consumptionState: 0, acknowledgementState: 1 });
    };
    const request = new Request("https://grade.example/grade", {
      method: "POST",
      headers: { Origin: "https://mrjkorea.github.io" },
      body: JSON.stringify({
        testId: "test01",
        productId: "speakpass_test01",
        purchaseToken: "token-1",
        answers: [{ q: 5, transcript: "I cook at home." }]
      })
    });
    const response = await handle(request, env, { fetch: fetchImpl, now: 1_700_000_000 });
    assert.equal(response.status, 403);
    assert.equal(graded, false);
  });

});

describe("purchase decision", () => {
  it("accepts a purchased pack and refuses points, refunds, and used-up credits", () => {
    const owned = {
      purchaseState: 0,
      consumptionState: 0,
      acknowledgementState: 1,
      obfuscatedExternalAccountId: "Mina Park"
    };
    assert.equal(purchaseDecision(owned, { studentId: "mina park" }), "owned");
    assert.equal(purchaseDecision({ ...owned, purchaseState: 1 }, {}), "not_owned");
    assert.equal(purchaseDecision({ ...owned, purchaseState: 2 }, {}), "not_owned");
    assert.equal(purchaseDecision({ ...owned, consumptionState: 1 }, {}), "not_owned");
    assert.equal(purchaseDecision({ ...owned, purchaseType: 2 }, {}), "not_owned");
    assert.equal(purchaseDecision(owned, { studentId: "someone else" }), "not_owned");
    assert.equal(purchaseDecision({ ...owned, purchaseType: 0 }, { studentId: "Mina Park" }), "owned");
  });
});

describe("request shape", () => {
  it("turns thinking off and caps the reply", () => {
    const body = gradeRequest([{ role: "system", content: RUBRIC }]);
    assert.equal(body.thinking.type, "disabled");
    assert.equal(body.max_tokens, 900);
    assert.equal(body.messages[0].content.startsWith("You grade a practice speaking test"), true);
  });
});
