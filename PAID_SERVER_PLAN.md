# Paid marking server

This is a plan and a draft. Nothing here was deployed. No account was created. No money was spent.

SpeakPass AI grades a practice test on a Cloudflare Worker. The phone turns speech into text on the device and sends only that text. The Worker holds the grader key. The student app saves the result with the shared MRJ sign-in.

For now the site is free for your own students on GitHub Pages. `PAYMENT_MODE` is `free` or `play`. The default is `free`. In free mode the Worker skips Google Play. It allows a mark only after the shared sign-in script accepts the student id and token. The check uses the existing `progress` action. There is no new sheet and no new column.

Each student can get 3 marks per UTC day. The same student must wait 60 seconds between marks. The Worker allows 120 marks in total per UTC day. The count is one Workers KV record per day, written before the model is called. A missing store refuses the mark. Two requests at the same instant can both pass, so a day can go one past 120. The exact deploy commands are in `DEPLOY_STEPS.md`.

Play purchase code stays in the Worker. Set `PAYMENT_MODE` to `play` and deploy again when packs go on sale. That path is the rest of this plan.

The review screen has a Get AI marking button for questions 1 through 11. The address is `GRADE_WORKER_URL` in `js/config.js`. Until that address is set, the button says the marking service is not deployed and sends no request. `gradePaid` still returns `coming soon`.

This practice is not a TOEIC test. TOEIC is a registered trademark of ETS. This product is not endorsed or approved by ETS.

## Architecture

The phone runs the test the way it does now. Whistle runs on the device. In the Whistle helper, the recognizer returns `parsed.text`. That string is the transcript. The audio stays on the phone. The Worker never receives a recording.

The student signs in with the shared MRJ sign-in, the same `mrj-auth.js` already used by the other classroom apps. The boot tag uses `data-mrj-app="speakpass"`. That name is also the score program.

A paid grade has four hops.

1. The Android app buys a one-time product in Google Play. It sets the obfuscated account id to the student id. It does not consume the purchase.
2. The app sends the Worker the test id, the product id, the purchase token, the student id, and the transcripts for the questions it should grade.
3. The Worker checks the purchase with Google. If the pack is owned, the Worker grades the transcripts. The reply is raw points, a maximum, a percent, and a short comment for each question.
4. The app saves that reply. Scores go through `js/mrj-scores.js`. Progress goes through `MRJ_AUTH.loadPack` and `MRJ_AUTH.savePack`. The Worker does not write the spreadsheet.

The Worker holds two secrets. One is the grader key. The other is the Google service-account JSON. The grading prompt lives in the Worker too. The student app does not contain the key, the prompt, or the grader's name.

The questions, picture notes, documents, and sample answers are read from the test files in this repo. The Worker ignores any question text the phone tries to send. A student cannot swap in an easier question.

The prompt is two messages. The first message is the scoring guide and the standing rules. That text is the same on every call. The second message is the test and the transcripts. The guide comes first so a later call can reuse it. The guide tells the model to ignore speech-to-text errors. A homophone, missing punctuation, a dropped short word, or a split word is not a miss when the line still matches the task. A missing sentence, a wrong fact, or a different topic is a real miss.

Questions 1 and 2 are read aloud. The official marks are pronunciation and intonation. The Worker cannot hear the voice, so those two marks follow the printed text. A transcript that contains the printed text scores high. The plan does not pretend this is a human listener.

The marks follow the 2022 question types. ETS describes them on the Speaking and Writing format page, read on 13 October 2026: questions 1–2 read aloud, 3–4 describe a picture, 5–7 answer questions, 8–10 answer from a document, and 11 give an opinion. The ETS score user guide, also read that day, says questions 1 and 2 each get a pronunciation mark and an intonation mark, questions 1 through 10 use a 0 to 3 scale, and question 11 uses a 0 to 5 scale.

A full test therefore has a raw maximum of 41. Question 1 is 3 plus 3. Question 2 is 3 plus 3. Questions 3 through 10 are 3 each, which is 24. Question 11 is 5. The sum is 12 plus 24 plus 5, which is 41. ETS converts that sum to a 0 to 200 scale. The conversion table is not published here, so this practice stores the raw sum. It does not invent an official scaled score.

Empty transcripts score 0 and are not sent to the grader.

The model call turns thinking off and stops the reply at 900 tokens. The reply must be JSON. Comments are cut to a short line. If a comment names the grader, that comment is dropped.

One grade is one request to the Worker. Inside that request the Worker calls Google, and then calls the grader once. A pack that covers the test is enough for every question in that test. There is no point balance and no second charge for question 11.

## Cloudflare free limits, and when a bill starts

These figures are from Cloudflare's Workers limits page and Workers pricing page. The pricing page says it was last updated on 2 October 2026. Both pages were read on 13 October 2026.

https://developers.cloudflare.com/workers/platform/limits/

https://developers.cloudflare.com/workers/platform/pricing/

On the Workers Free plan, an account gets 100,000 inbound requests per day. The counter resets at midnight UTC. Past that, Cloudflare returns Error 1027. That error does not charge a card.

Each request gets 10 milliseconds of CPU time. CPU time is time spent running your code. Waiting on a network call does not count. Past 10 milliseconds, Cloudflare returns Error 1102, with the message "Worker exceeded resource limits". That error does not charge a card. Cloudflare says the average Worker uses about 2.2 milliseconds, and that heavier parsing often uses 10 to 20 milliseconds. This grade builds a short prompt and reads a small JSON reply. If a real grade ever dies with Error 1102, that is the moment the paid plan is required.

An HTTP request has no duration limit and no duration charge while the phone stays connected. Memory is 128 MB per isolate. Each request may make 50 subrequests. A grade makes at most four: a Google access token, the purchase read, the acknowledge call, and the grader call. Four is inside the limit of 50. Each request may have 6 connections waiting for headers at the same time. This grade waits on one connection at a time.

An account may have 100 Workers, 64 environment variables on each Worker, and 5 KB in each variable. The service-account JSON fits in one secret. The script may be up to 64 MiB uncompressed. Startup time may be up to 1 second. The free request body limit on a free Cloudflare account is 100 MB. This Worker refuses a body over 100,000 characters before it does any work.

Workers Logs on the free plan include 200,000 events per day, kept for 3 days. The pricing page says that on 1 December 2026 those log prices move to Observability pricing. This draft does not turn on Logpush. Logpush is paid. The Worker does not write transcripts into logs.

The Worker does not use KV, Durable Objects, Queues, or Hyperdrive. Those products are not turned on, so their meters do not run.

Cloudflare does not bill the calls your Worker makes. The pricing page says inbound requests are what count. A grade is one inbound request.

A bill starts only when you turn on the Workers Paid plan. The free plan does not upgrade itself when you pass a limit. It returns an error instead. The paid plan has a minimum charge of $5 USD per month. It includes 10 million requests each month, then $0.30 per extra million requests. It includes 30 million CPU milliseconds each month, then $0.02 per extra million CPU milliseconds. Wall-clock time is still free. Leave the paid plan off. The classroom volume sits inside 100,000 requests a day.

## Cost of one full test

Prices below are from the DeepSeek pricing page, read on 13 October 2026.

https://api-docs.deepseek.com/quick_start/pricing

The Worker calls the model named `deepseek-flash`. The page lists that name as DeepSeek-V4.1-Flash. Prices are in US dollars per 1 million tokens.

Off-peak, a cache hit on input is $0.003. A cache miss on input is $0.15. Output is $0.60.

Peak is double. A cache hit on input is $0.006. A cache miss on input is $0.30. Output is $1.20.

Peak hours are 01:00 to 04:00 UTC and 06:00 to 10:00 UTC, Monday through Friday, excluding Chinese public holidays. Every other hour is off-peak. Weekends are off-peak. A Chinese public holiday is off-peak all day. In Korea, those peak hours are 10:00 to 13:00 and 15:00 to 19:00. That conversion is mine. The pricing page states the UTC hours.

The cache guide was read the same day.

https://api-docs.deepseek.com/guides/kv_cache

Caching is on by default. There is no switch to set and no storage line on the pricing page. A later request reuses a saved prefix only when the later request matches that prefix from the start. The guide says the service stores a shared prefix after it sees the same beginning more than once, and that a hit is best-effort. Unused cache is cleared after hours or days. The first full tests can miss. Later tests can hit the guide and still pay the miss price on the test and the transcripts.

The thinking-mode guide was read the same day.

https://api-docs.deepseek.com/guides/thinking_mode

Thinking is on unless the request turns it off. The Worker sends thinking disabled, so the reply is the score JSON and not a chain of thought. The output cap is 900 tokens.

Token counts below are an estimate. They use about 4 characters per token. They are not a bill. The real bill is the `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, and `completion_tokens` fields the API returns.

The guide in this repo is 2,930 characters, about 733 tokens. That part is the cached prefix.

For Practice Test 1, with each transcript about as long as that question's sample answer, the second message is 11,823 characters, about 2,956 tokens. The whole input is about 3,689 tokens.

A normal reply of eleven short comments is about 500 output tokens. The cap is 900.

Off-peak, with nothing cached, a normal full test is about 3,689 times $0.15 per million, plus 500 times $0.60 per million. That is $0.000553 plus $0.000300, which is $0.00085. At the 900-token cap the output part is $0.000540, and the total is $0.00109.

Off-peak, when the 733-token guide is a cache hit and the 2,956-token test is a miss, add 733 times $0.003 per million. That is about $0.000002. The test part is about $0.000443. With a 500-token reply the total is about $0.00075.

Peak doubles each of those rates. A normal full test with nothing cached is about $0.00171. At the output cap it is about $0.00219. With the guide cached and a normal reply it is about $0.00149.

If every transcript is cut at the 2,500 character limit, the input is about 9,845 tokens. Off-peak, with nothing cached and a 900-token reply, that is about $0.0020. Peak for that same high case is about $0.0040.

So one full test stays under half a US cent even in the high case at peak. One US dollar at the high peak figure covers about 250 full tests. This task did not buy credit. Check the pricing page again before you add any balance, because the page says prices can change.

The pro model on that same page is much higher. Off-peak it is $0.66 per million input tokens on a miss, $0.022 on a hit, and $1.98 per million output tokens. The Worker must keep sending the flash name.

## Google Play purchase check

Students buy inside Google Play. The website does not take a card. The app does not keep points or credits. A pack does not expire.

Each pack is a one-time product. It is not a subscription. The Android app must not consume it. A consumed purchase is a credit, and the Worker refuses `consumptionState` 1. A Play Points reward has `purchaseType` 2, and the Worker refuses that too. A license test has `purchaseType` 0, and the Worker allows it so you can test without a charge.

The product ids in the draft are `speakpass_test01` through `speakpass_test10`, plus `speakpass_tests_01_10` for all ten tests. Buying one test unlocks that test. Buying the pack unlocks all ten. The unlock lasts because Google keeps a purchased, unconsumed one-time product on the account.

The Worker reads the purchase with the Play Developer API, method `purchases.products.get`, as documented on the page read on 13 October 2026.

https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get

The call is a GET to `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/products/{productId}/tokens/{token}`. The header is `Authorization: Bearer` plus an access token. The token comes from the service account. The scope is `https://www.googleapis.com/auth/androidpublisher`.

The Worker allows the grade only when `purchaseState` is 0. That means purchased. State 1 means canceled, which includes a refund Google has already made, so the grade is refused. State 2 means pending, so the grade is refused. The Worker does not call a refund method. There is no refund button in the app. If Google cancels a purchase, the next grade sees state 1 and stops.

If `acknowledgementState` is 0, the Worker sends a POST to the same path with `:acknowledge` on the end. Google wants a new purchase acknowledged. The Worker never calls the consume method.

If the purchase carries `obfuscatedExternalAccountId`, it must match the signed-in student id. The match ignores case and extra spaces, the same way the sign-in script builds an id key. The Android app sets that id with Play Billing when the student buys.

The Worker asks Google on every grade. It does not keep a copy of who owns what. A refund shows up on the next check. The purchase token is not written into the score sheet.

The getting-started page, read the same day, says a service account needs Play Console access, including permission to view financial data and to manage orders and subscriptions, before these billing calls work.

https://developers.google.com/android-publisher/getting_started

Permission can take up to a day to start working. A 401 that says the user has insufficient permissions is that wait, or a missing permission.

## Scores and progress

The sign-in script in `mrjkorea/mrj-signin` already stores both things. This draft does not change that script or its columns.

`save_pack` and `load_pack` use the sheet `AppProgress`. The columns are `id_key`, `program`, `progress_json`, and `updated_at`. A long value spills into `AppProgressMore` with columns `id_key`, `program`, `part`, and `chunk`. The client sends `action`, `id`, `token`, `program`, and `progress_json`. For every program except `decodable`, the script replaces the stored string with the string you send. SpeakPass uses the program `speakpass`, so the phone must load the pack, merge on the phone, and save the whole string. If the load fails, the phone does not save. A save without a load would wipe the row.

`js/mrj-scores.js` is the copy from `day4-speak`, unchanged. That copy posts one learning event and also calls `MRJ_AUTH.noteScore`. The event fields stay `student_email`, `student_name`, `session_id`, and one event with `event_id`, `event_kind`, `source`, `curriculum_program`, `app_name`, `book_title`, `unit_title`, `item_id`, `item_type`, `score_value`, `score_max`, `score_pct`, `correctness`, `completed`, `duration_seconds`, `local_date`, `identity_method`, `identity_confidence`, and `metadata_json`.

`note_score` writes `StudentScoreIndex`. The columns are `id_key`, `program`, `item_id`, `score_value`, `score_max`, `score_pct`, `local_date`, and `updated_at`. One student, one program, and one item id share one row. A later save replaces that row.

`js/paid-mark.js` calls `MRJ_SCORES.post` only. It does not call `noteScore` itself, because the copied score file already does. It sends numbers in `scoreValue`, `scoreMax`, and `scorePct`. The program is `speakpass`. The app name is SpeakPass AI.

A full test of all 11 questions writes item id `test01` with a maximum of 41, and also writes `test01:q1` through `test01:q11`. A practice grade writes only the question rows. It does not write `test01`, because that row is the full-test score and a later write would replace it.

The progress string for program `speakpass` looks like this. `v` is 1. `tests` holds one object per test. Each test holds `full` for the last complete grade and `questions` for each question number. Each of those holds `raw`, `rawMax`, `pct`, and `at`. The date comes from `MRJ_SCORES.localDate`. The pack does not hold a purchase token.

The My scores panel already lists rows for the app id. With `data-mrj-app="speakpass"`, it asks for program `speakpass`. No new panel code is required.

`js/grade.js` still returns `coming soon`. The app check requires that. Turn the screen on only after the Worker is deployed and a test purchase succeeds.

## Accounts you create

You already have the Google account that runs the sign-in script. You already have GitHub. You do not create a second Google account. You do not run a server. The Worker runs on Cloudflare's machines. Your computer is only used to paste secrets and to deploy once.

You create one free account. That account is Cloudflare. Leave it on the Workers Free plan.

You do not create a new grader account in this setup. Put a key you already have into the Cloudflare secret named `GRADE_API_KEY`. This task did not buy credit.

Selling to the public needs Google Play Console on the Google account you already use. Play Console Help, "Get started with Play Console", read on 13 October 2026, says full distribution has a one-time fee of US$25.

https://support.google.com/googleplay/android-developer/answer/6112435

That fee is not a free account, and this task does not pay it. A limited-distribution Android account is free and reaches 20 devices. Creating it would be a second free account, so this plan does not use it. If you already have Play Console, use that one.

The Play check uses a service account inside the Google Cloud project you already can open. That is a key, not a new login. The JSON is pasted into the Cloudflare secret `PLAY_SERVICE_ACCOUNT` and then deleted from the computer.

If you have no grader key yet, and you have no Play Console yet, the draft can still sit in the repo. Grading and selling wait.

## Setup, when you are ready

Do these steps later. They were not done for this draft.

1. Create the free Cloudflare account. Stay on the Workers Free plan. Do not turn on the $5 paid plan.
2. Create a Worker named `speakpass-grade`. Deploy the `worker/` folder with Wrangler from your computer, once. You do not leave a process running. The command is `npx wrangler deploy` inside `worker/`, after `npx wrangler login`.
3. In the Worker settings, add the variable `PACKAGE_NAME` with the real Android application id. The draft uses `com.mrjkorea.speakpass` as a placeholder. Change it to the id you register.
4. Set `ALLOWED_ORIGINS` to `https://mrjkorea.github.io`. Add any later app origin only if the WebView sends one.
5. Add the secret `GRADE_API_KEY` with the key you already have.
6. On the existing Google account, open Google Cloud, enable the Google Play Android Developer API, and create a service account. Download its JSON key once.
7. In Play Console, invite that service-account email under Users and permissions. Grant view financial data, and manage orders and subscriptions, as the getting-started page requires. Wait if the first call returns 401.
8. Paste the whole JSON into the secret `PLAY_SERVICE_ACCOUNT`. Delete the JSON file from the computer.
9. In Play Console, create one-time products with the ids in `worker/src/products.js`. Do not create subscriptions. Do not create consumable credits. Do not add a card form to the website.
10. In the Android app, use Play Billing. On the purchase, set the obfuscated account id to the student id. Do not call consume. Send the product id, the purchase token, and the Whistle transcript to the Worker. Then call `savePaidResult` from `js/paid-mark.js`.
11. The site already loads the shared sign-in with `data-mrj-app="speakpass"` and loads `js/mrj-scores.js` before the app module. After deploy, set `GRADE_WORKER_URL` in `js/config.js` to the Worker https address with no path. Until that line is set, the button says the service is not deployed. `gradePaid` still returns `coming soon`.
12. Buy one license-test product from a test account. Grade one full test. Confirm the reply has `scoreMax` 41, the score sheet gained rows for program `speakpass`, and the pack load shows the same test. Confirm a canceled token is refused.

Run the draft tests before you deploy. From `worker/`, run `node --test`. From the repo root, run `node scripts/check.mjs`.

## What this draft does not do

It does not deploy the Worker. It does not create Cloudflare, Play, or a grader account. It does not buy credit. It does not change the sign-in script, the score columns, or `js/mrj-scores.js`. The Get AI marking button is wired, and `GRADE_WORKER_URL` is empty, so the button does not call the Worker yet. `gradePaid` still returns `coming soon`.
