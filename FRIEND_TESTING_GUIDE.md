# RE AIssistant v2 — Friend Testing Guide

Use this doc when sharing the app with testers. It covers what’s live, what to try, and how to report issues.

**Live app:** [https://reaiassistant-v2.web.app](https://reaiassistant-v2.web.app)

**Last updated:** July 2026 (Phases 7–10 deployed)

---

## What we’re testing

RE AIssistant is a tool for real estate agents: open houses, offers, buyer tours, SMS inbox, contacts, and automated follow-ups. We want real people to click through the app on **phone and desktop** and tell us what breaks, confuses, or feels wrong.

You don’t need to test everything — but the more areas you hit, the better.

---

## Before you start

1. **Create an account** (or use credentials the host gives you).
2. **Use Chrome or Safari** on mobile if possible — that’s where most agents will live.
3. **SMS features** only work if Twilio is configured for the project. If texts don’t send, still note what you tried; other features should work.
4. **Email automations** may show as *Failed* in Automations → Activity if SendGrid isn’t set up yet. SMS automations are the priority for this round.

---

## Quick smoke path (~15 minutes)

Good first pass if time is limited:

| Step | Where | What to do | What “good” looks like |
|------|--------|------------|-------------------------|
| 1 | **Dashboard** (`/dashboard`) | Log in, scroll the “This month” stats | Numbers load (or show 0 / —). Feature grid still visible below. |
| 2 | **Open Houses** (`/open-houses`) | Create or open an open house; check in a visitor (name + phone) | Visitor saves; no crash on mobile. |
| 3 | **Automations** (`/automations`) | Open **Activity** tab | A task may appear for the check-in (status: Scheduled → Sent/Failed). Tasks update within ~5 minutes. |
| 4 | **Contacts** (`/contacts`) | Open the list after check-in | Visitor appears as a contact (may take a moment after sync). |
| 5 | **Messages** (`/messages`) | Open inbox; reply if you have an SMS thread | Threads group by phone; unread badge on nav if inbound unread exists. |
| 6 | **Nav** | Tap every sidebar / bottom nav item | No blank screens or obvious layout breaks. |

---

## Feature-by-feature checklist

### Dashboard — “Money view”

**Route:** `/dashboard`

- [ ] “This month” tiles load: open house visitors, active offers, tours, SMS response rate, open houses hosted, new contacts
- [ ] Each tile links to the right section when clicked
- [ ] Skeleton placeholders show briefly, then numbers (0 is OK for new accounts)
- [ ] Feature shortcut grid and “Signed in as” card still look correct

**Report if:** numbers look wrong after you know you did something (e.g. checked in a visitor but count stays 0), layout breaks on mobile, or page errors.

---

### Open Houses

**Route:** `/open-houses`

- [ ] Create / view an open house
- [ ] Visitor check-in (name, phone, email if available)
- [ ] List and detail views work on mobile (no horizontal scroll hell)

**Report if:** check-in fails, data disappears on refresh, or forms are hard to use on phone.

**Automations tie-in:** After check-in, if visitor SMS is enabled in **Automations → Rules**, an activity row should appear within a few minutes.

---

### Offers

**Route:** `/offers`

- [ ] View offers list
- [ ] Create or finalize an offer (if you have test flow access)

**Report if:** offer doesn’t save, PDF/upload breaks, or finalize doesn’t trigger expected behavior.

**Automations tie-in:** Finalizing an offer can enqueue buyer-agent SMS/email acks (see Automations → Activity).

---

### Buyer Scheduling

**Route:** `/buyer/schedule`

- [ ] Create a buyer tour / schedule
- [ ] Add targets (listing agents, times)

**Report if:** schedule doesn’t save or mobile form is unusable.

**Note:** “Buyer tour follow-up SMS” automation is marked **coming soon** in the UI — don’t expect that one yet.

---

### Messages (Unified Inbox)

**Route:** `/messages`

- [ ] Thread list shows conversations grouped by contact phone
- [ ] Search filters by phone or message preview
- [ ] Tap a thread → conversation opens; on mobile, **Back** returns to list
- [ ] Unread inbound messages show a dot/count; nav **Messages** badge matches
- [ ] Opening a thread marks inbound messages as read (badge count drops)
- [ ] Reply composer + quick-reply chips work; Send calls backend (toast on success/failure)
- [ ] Outbound messages align right (brand color); inbound align left

**Report if:** badge shows unread but no thread appears, reply fails, or desktop split-pane layout breaks.

---

### Contacts (Light CRM)

**Route:** `/contacts`

- [ ] List loads in real time
- [ ] After open house check-in / offer / buyer tour, contacts **auto-populate** (note: “Synced from your activity”)
- [ ] Search and filter chips (Buyers, Sellers, Listing Agents, tags)
- [ ] Add / edit contact (name, phone, email, type, tags, notes)
- [ ] “Log contact” updates last contacted time
- [ ] Delete with confirmation works

**Report if:** duplicate contacts pile up incorrectly, manual edits get overwritten on refresh, or sync never runs.

---

### Automations

**Route:** `/automations`

**Rules tab**

- [ ] Global settings: quiet hours, timezone, send window
- [ ] Toggle rules on/off (visitor SMS, agent reminder, offer acks, etc.)
- [ ] Edit delay / timing and message templates; preview updates
- [ ] **Save** persists settings (reload page to confirm)
- [ ] “Enable recommended defaults” turns on agent open-house reminder

**Activity tab**

- [ ] Recent tasks list (up to 50), filter by status: All / Scheduled / Sent / Failed / Skipped
- [ ] After triggering an event (check-in, finalize offer, create open house), new rows appear
- [ ] Status moves from **Scheduled** to **Sent** or **Failed** within ~5 minutes (worker runs on a schedule)

**Report if:** rules don’t save, activity never shows tasks, SMS stuck on Scheduled forever, or error messages are unclear.

**Known limits**

- Worker runs about **every 5 minutes** — not instant.
- **Quiet hours** and **business hours** may delay sends.
- **DNC** numbers are skipped (status: Skipped).
- **Email** tasks fail gracefully if SendGrid isn’t configured.

---

### Other nav items (lower priority this round)

| Section | Route | Notes |
|---------|--------|--------|
| Listings | `/listings/new` | Create listing flow |
| Billing | `/billing` | Stripe / plan — test only if host asks |

---

## Devices & browsers

Please try at least one of each if you can:

- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] Desktop Chrome or Edge

Call out which device + browser you used in every bug report.

---

## How to report issues

Send the host a short note per issue. Copy/paste this template:

```
**What I tried:**
(e.g. Checked in visitor at open house on iPhone)

**What I expected:**
(e.g. Contact appears in Contacts within a minute)

**What happened instead:**
(e.g. Contacts page empty after refresh)

**Device:** iPhone 14 / Safari
**Account email:** (if ok to share)
**Screenshot:** (attach if possible)
**URL:** /contacts or full path
```

**Helpful extras**

- Exact steps to reproduce (1, 2, 3…)
- Time of day (matters for automations / quiet hours)
- Whether it happened once or every time

---

## What *not* to worry about yet

- Cosmetic polish (unless it blocks use)
- Empty metrics on a brand-new account with no activity
- Email automation failures if SMS is the focus
- Legacy v1 app URLs or features not in this v2 nav
- Automated smoke script (`npm run smoke:phase4`) — that’s for developers pre-release

---

## For the host (you)

When testers finish, collect:

1. Blockers (can’t sign up, can’t check in, can’t send SMS)
2. Data bugs (contacts sync, dashboard counts, missing threads)
3. Automation gaps (task never created, stuck Scheduled, wrong template)
4. Mobile UX pain (tap targets, back nav, forms)

Then come back with notes — fixes can be targeted per area.

**Dev verification (optional, before/after fixes):**

```bash
npm run build
npm run smoke:phase4
```

**Firebase deploy reminders (host only):**

- Indexes: `firebase deploy --only firestore:indexes`
- Rules: `firebase deploy --only firestore:rules`
- Hosting: `firebase deploy --only hosting:reaiassistant-v2`
- Functions: deploy by name if legacy functions still exist in the project (avoid blanket `--only functions` delete prompts)

---

## Phase reference (what shipped recently)

| Phase | Feature | Route |
|-------|---------|--------|
| 7 | Messages / unified inbox | `/messages` |
| 8 | Contacts / lightweight CRM | `/contacts` |
| 9 | Dashboard analytics | `/dashboard` |
| 10 | Automations & follow-ups | `/automations` |

Earlier phases (open houses, offers, buyer scheduling, listings, billing) are also in the app — test as time allows.
