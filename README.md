# RE AIssistant v2

Clean modular fork of RE AIssistant. Targets Firebase project `realestatescheduler-fa876`.

## Stack

- Frontend: Vite, React 18, React Router, Tailwind
- Backend: Firebase Cloud Functions (Node 20), Firestore

## Setup

1. Copy `.env.example` to `.env` and fill in values (after rotating compromised keys from the old repo).
2. Install and run:

```bash
npm install
npm run dev
```

3. Functions:

```bash
cd functions && npm install
```

## Environment variables

### Frontend (Vite)

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

### Cloud Functions

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLEAI_KEY`
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `SENDGRID_API_KEY`
- `SEND_FROM_EMAIL`
- `SEND_FROM_NAME`
- `FRONTEND_URL`

## Project layout

```
src/
  config/          firebase, env, stripe
  contexts/        AuthContext
  features/        auth, openHouse, offers, messaging, billing, dashboard (stubs)
functions/
  shared/          admin init, health check
  offers/          offer callables (stubs)
  openHouse/       open house callables (stubs)
  billing/         Stripe (stubs)
  messaging/       SMS/threads (stubs)
  ai/              PDF/Gemini (stubs)
```

## Migration phases

See the surgical fork plan. Phase 2 scaffold only — feature ports start at Phase 3.

## SmartShowings

SmartShowings is the showing-coordination assistant inside REAIssistant. It is **off** unless both flags are the string `true`:

- Web app: `VITE_SMART_SHOWINGS_ENABLED=true` (rebuild and redeploy hosting)
- Cloud Functions: `SMART_SHOWINGS_ENABLED=true`

While it is on, outbound SMS still does **not** leave the project unless `SMART_SHOWINGS_SMS_MODE=live`. The default is `mock`: approvals are stored and shown in the queue, and tests never call Twilio. Email fallback is the same with `SMART_SHOWINGS_EMAIL_MODE` (default `mock`).

What the first version does:

- Buyer-side: from a tour stop, queue a plain SMS (or email if there is no mobile) to the listing agent, including when they are not a user. The text names the AI assistant and the agent, and includes STOP.
- Listing-side: a showing profile per listing, and a one-tap approval (`1` approve, `2` suggest a time, `3` decline) before a confirmation is recorded.
- Separate 1:1 threads. Replies of YES / NO / a suggested time update the tour stop. Unclear replies wait for a person.
- Business-card photo extraction uses the server xAI key. Results are Verified, Partial, or Failed.
- Every proposed outbound message sits in an approval queue with a hash-chained audit log.
- Quiet hours are 8:00 a.m.–8:00 p.m. Pacific. STOP opts that number out.

What is stubbed:

- California DRE has no official API. The lookup adapter returns unknown and does not scrape the public site. A person can mark Partial as Verified (“listing-agent attested”). Failed cannot be upgraded.
- The assistant never sends lockbox, gate, alarm, or other access details. That stays human-only.
- No AI voice calls.
- No automatic send when quiet hours end (the item stays in the queue).
- No assistant-to-assistant signatures, ShowingTime, or calendar sync.

## Owner steps before production traffic

These are console steps. The app does not turn them on by itself.

1. **Google Cloud billing (Blaze).** Firebase → project `realestatescheduler-fa876` → Upgrade, or Google Cloud Console → Billing, and link a billing account. Cloud Functions cannot call Stripe until this is on. Team and plan checkout in the app already call Stripe; they fail until billing is enabled.
2. **Stripe live keys.** Replace the test secret, webhook secret, publishable key, and price IDs. Point the Stripe webhook at the deployed `stripeWebhook` URL. Do not commit keys. Plan status is written to `subscriptions/{uid}` from the webhook; the app reads that record.
3. **Twilio A2P 10DLC.** Register REAIssistant as the brand (campaign, opt-in, HELP/STOP, privacy and terms) before production SMS. Use Twilio test credentials in development. Keep `SMART_SHOWINGS_SMS_MODE=mock` until registration is approved.
4. **xAI secret.** `firebase functions:secrets:set XAI_API_KEY` with the platform key. Agents are not asked to paste a key. A bring-your-own key on the Assistant page is optional.

Do not deploy from this change set unless you mean to. Do not use Stripe live mode or send real SMS from tests.
