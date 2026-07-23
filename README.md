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
