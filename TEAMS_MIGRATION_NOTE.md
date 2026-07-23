# Phase 11 — `teamId` stamping & migration note

Short reference for how shared team visibility works and what to do about data created **before** Phase 11.

---

## How sharing works

Team read access is granted by the existing `sameTeam(resource)` rule in `firestore.rules`:

```
resource.data.teamId == users/{uid}.teamId
```

So a document is visible to teammates **only if it carries a `teamId` matching the viewer's team**. Phase 11 wires this up by stamping `teamId` at create time.

---

## Create paths that stamp `teamId` (done in Phase 11)

| Collection | Where stamped | Source of `teamId` |
|------------|---------------|--------------------|
| `offers` | `functions/offers/handlers.js` → `submitOfferInit` | `getUserTeamIdOrNull(ownerUid)` (server) |
| `listings` | `src/features/offers/ListingCreate.jsx` | `userProfile.teamId` (client) |
| `openHouses` | `src/features/openHouse/OpenHouseManager.jsx` | `userProfile.teamId` (client) |
| `messages` | `functions/messaging/handlers.js` | `getUserTeamIdOrNull` (server) |

All default to `null` for solo users, so nothing changes for non-team accounts.

> Note: client-stamped paths (`listings`, `openHouses`) read `teamId` from the auth profile. Because clients cannot forge `users/{uid}.teamId` (locked by rules) and can only create docs they own, this is safe — a user can only stamp their **own** team's id.

---

## The migration gap (important)

Stamping only applies to **newly created** documents. Two categories need attention:

### 1. Docs created before Phase 11 deployed
Any `offers` / `listings` / `openHouses` / `messages` created before this release have **no `teamId`** and will **not** appear in a teammate's view or the Team dashboard. They remain fully visible to their original owner — nothing is lost, just not shared.

### 2. Docs created before the owner joined a team
If an agent creates listings/offers as a solo user, then later joins/creates a team, those earlier docs still have `teamId: null`. They won't retroactively become team-visible.

**For a fresh launch with few/no real users, you can safely skip backfill.** It only matters if early testers created data you now want shared across a team.

---

## Optional backfill (only if needed)

Run once, server-side (Admin SDK — bypasses rules). Backfills a single owner's historical docs to their current team. Pseudocode:

```js
// scripts/backfill-teamid.js  (run with firebase admin credentials)
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function backfillOwner(ownerUid) {
  const userSnap = await db.collection('users').doc(ownerUid).get();
  const teamId = userSnap.get('teamId');
  if (!teamId) return console.log('User has no team; skipping.');

  const targets = [
    { col: 'offers',     field: 'ownerUid' },
    { col: 'listings',   field: 'ownerUid' },
    { col: 'openHouses', field: 'agentId' },
    { col: 'messages',   field: 'agentUid' },
  ];

  for (const { col, field } of targets) {
    const snap = await db.collection(col).where(field, '==', ownerUid).get();
    let batch = db.batch(), n = 0;
    for (const doc of snap.docs) {
      if (doc.get('teamId')) continue;        // don't overwrite
      batch.update(doc.ref, { teamId });
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400) await batch.commit();
    console.log(`${col}: stamped ${n} docs`);
  }
}
```

Guidelines:
- **Idempotent** — skips docs that already have a `teamId`.
- **Never overwrite** an existing `teamId` (a doc could belong to a different team).
- Run per owner (e.g. loop over a team's member uids) rather than a blind collection sweep.
- `openHouses.agentId` and `messages.agentUid` are the owner fields — not `ownerUid`.

---

## Verify after deploy

1. Deploy rules + indexes + the team/billing functions (deploy functions **by name** — legacy functions still exist).
2. Two accounts: A creates a team, invites B, B accepts.
3. A creates a **new** open house / listing → B sees it under **Dashboard → Team**.
4. Confirm A's **old** (pre-team) docs do *not* appear for B — expected, unless backfilled.
