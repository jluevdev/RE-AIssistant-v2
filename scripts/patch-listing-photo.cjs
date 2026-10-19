const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { extractListingPhotoFromHtml, canonicalizeListingUrl } = require('../functions/buyer/listingLinks');

const raw = process.argv[2] || 'https://www.zillow.com/homedetails/15742-Lorretta-St-Victorville-CA-92394/137707310_zpid/?utm_campaign=zillowwebmessage&utm_medium=referral&utm_source=txtshare';
const url = canonicalizeListingUrl(raw);
const PROJECT_ID = 'realestatescheduler-fa876';
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const SCHEDULE_ID = 'lvTsR1qYn187KUtSNUDC';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function loadTokens() {
  const configPath = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'),
  ].find((p) => fs.existsSync(p));
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).tokens;
}

function str(fields, key) {
  return fields?.[key]?.stringValue || '';
}

(async () => {
  const listingRes = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await listingRes.text();
  const photo = extractListingPhotoFromHtml(html);
  const photo960 = String(photo || '').replace(/-cc_ft_\d+\.(jpe?g|webp)$/i, '-cc_ft_960.$1');
  const [hOrig, h960] = await Promise.all([
    photo ? fetch(photo, { method: 'HEAD', redirect: 'follow' }) : { status: 0 },
    photo960 ? fetch(photo960, { method: 'HEAD', redirect: 'follow' }) : { status: 0 },
  ]);
  console.log(JSON.stringify({
    listingStatus: listingRes.status,
    photo,
    photo960,
    origStatus: hOrig.status,
    status960: h960.status,
  }, null, 2));

  const tokens = loadTokens();
  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID);
  oauth2.setCredentials({ refresh_token: tokens.refresh_token, access_token: tokens.access_token });
  const { token } = await oauth2.getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const getRes = await fetch(`${BASE}/buyerSchedules/${SCHEDULE_ID}`, { headers });
  const doc = await getRes.json();
  const values = doc.fields.targets.arrayValue.values || [];
  let hits = 0;
  for (const item of values) {
    const fields = item.mapValue.fields;
    const hay = `${str(fields, 'address')} ${str(fields, 'sourceUrl')}`;
    if (!/lorretta|loretta|15742/i.test(hay)) continue;
    console.log('schedule hit', {
      address: str(fields, 'address'),
      sourceUrl: str(fields, 'sourceUrl'),
      photoUrl: str(fields, 'photoUrl'),
    });
    if (photo) fields.photoUrl = { stringValue: photo };
    if (!str(fields, 'sourceUrl')) fields.sourceUrl = { stringValue: url };
    hits += 1;
  }
  if (!hits || !photo) {
    console.log('no patch');
    return;
  }
  const patchRes = await fetch(`${BASE}/buyerSchedules/${SCHEDULE_ID}?updateMask.fieldPaths=targets`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { targets: doc.fields.targets } }),
  });
  console.log('schedule patch', patchRes.status);
  const tokenId = str(doc.fields, 'shareTokenId');
  const tokenGet = await fetch(`${BASE}/clientPlanTokens/${tokenId}`, { headers });
  const tokenDoc = await tokenGet.json();
  const listings = tokenDoc.fields.publicListings?.arrayValue?.values || [];
  for (const item of listings) {
    const fields = item.mapValue.fields;
    const hay = `${str(fields, 'address')} ${str(fields, 'sourceUrl')}`;
    if (!/lorretta|loretta|15742/i.test(hay)) continue;
    fields.photoUrl = { stringValue: photo };
    fields.sourceUrl = { stringValue: url };
  }
  const tokenPatch = await fetch(`${BASE}/clientPlanTokens/${tokenId}?updateMask.fieldPaths=publicListings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { publicListings: tokenDoc.fields.publicListings } }),
  });
  console.log('token patch', tokenPatch.status);
})();
