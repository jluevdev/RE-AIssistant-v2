# Sets Firebase Functions secrets for RE-AIssistant-v2 (run from repo root after firebase login)
# Usage: .\scripts\set-firebase-secrets.ps1

$secrets = @(
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_SINGLE_AGENT',
  'STRIPE_PRICE_ALL_INCLUSIVE',
  'STRIPE_PRICE_PREMIUM_TEAM',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'FRONTEND_URL',
  'GOOGLEAI_KEY',
  'SENDGRID_API_KEY',
  'SEND_FROM_EMAIL'
)

Write-Host 'Paste each secret value when prompted (test Stripe/Twilio keys recommended).' -ForegroundColor Cyan

foreach ($name in $secrets) {
  Write-Host "`nSetting $name ..."
  firebase functions:secrets:set $name
}

Write-Host "`nDone. Deploy functions: firebase deploy --only functions" -ForegroundColor Green
