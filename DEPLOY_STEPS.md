# Deploy the marking Worker

These commands were not run for this draft. Run them only after a Cloudflare account exists and you already have an API key for the grader. Do not create those here. Do not turn on the paid Cloudflare plan.

From the repo root:

```bash
cd worker
npx wrangler@4 login
npx wrangler@4 kv namespace create GRADE_LIMITS
```

The second command prints a namespace id. Open `worker/wrangler.toml` and replace `REPLACE_WITH_KV_NAMESPACE_ID` with that id. Leave `PAYMENT_MODE` as `"free"`.

```bash
npx wrangler@4 secret put GRADE_API_KEY
npx wrangler@4 deploy
```

`secret put` asks for the key. Paste the key you already have. Do not put the key on the command line, and do not commit it.

Wrangler prints an https address. Copy the origin only, with no path on the end, into `GRADE_WORKER_URL` in `js/config.js`. Commit that address and publish the site the way you already publish GitHub Pages. Until that line is a real https address, the Get AI marking button says the service is not deployed and sends no request.

Free mode checks the student with the sign-in address already in `SIGNIN_ENDPOINT`. It does not check Google Play. Each student can receive 3 marks per UTC day, with at least 60 seconds between that student's marks. The Worker allows 120 marks in total per UTC day. Those caps live in `worker/src/limits.js`. The count is one Workers KV key per UTC day. Two requests at the same instant can both pass, so a day can go one past 120.

To sell packs later, change one setting and deploy again. In `worker/wrangler.toml` set `PAYMENT_MODE = "play"` and set `PACKAGE_NAME` to the real Android application id. Then:

```bash
cd worker
npx wrangler@4 secret put PLAY_SERVICE_ACCOUNT
npx wrangler@4 deploy
```

Paste the whole service-account JSON when `secret put` asks. The Play check in `worker/src/play.js` stays in the repo either way.
