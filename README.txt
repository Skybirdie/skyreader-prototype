SkyMedia Direct-ID Share Fix
============================

This package changes NEW share links from the old random-key form:
    /s/16-CHARACTER-KEY

to the direct-ID form:
    /s/<section>/<item-id>

Example:
    /s/slideshow/abovealllove202609131952

Files to replace
----------------
1. worker.js              -> replace the repository root worker.js
2. js/shareManager.js    -> replace the repository js/shareManager.js

Do NOT replace app.js for this change.
Do NOT change wrangler.jsonc for this change.

What the new flow does
----------------------
When a user creates a NEW share link, ShareManager sends the selected
ONE item to /__sky_share_prime. The Worker stores that item in MEDIA_KV
under a deterministic internal record key, then returns the direct
section/ID URL.

When somebody opens that URL, the Worker retrieves the one stored item,
builds a one-item SkyMediaContract in memory, injects it into index.html,
and the existing Manifest -> ShareManager -> ShareViewer flow opens the
shared item.

Existing /s/<16-character-key> links remain supported.
Existing ?k=... and ?contractz=... legacy links remain supported.

Cloudflare setup
----------------
No new binding is required. The existing MEDIA_KV and IMAGES bindings
are used. No wrangler.jsonc change is required.

Deployment
----------
Commit these two replacement files to the connected GitHub repository.
Cloudflare Workers Builds should then build/deploy the Worker normally.

Important testing
-----------------
After deployment, create a NEW share link from SkyMedia. Do not use an
old copied random-key link for the first test.

The expected new URL is similar to:
    https://skyreader-prototype.sliburd81.workers.dev/s/slideshow/ITEM-ID

Then open that URL in a fresh browser tab/window.

Usage/cost note
---------------
Creating a new direct-ID share performs one inbound Worker request and,
inside that invocation, one KV write plus one KV verification read.
Opening the shared URL performs one inbound Worker request plus one KV
read. That is intentionally comparable to the old random-key system,
which also performed one KV write + verification read at share creation
and one KV read when the shared URL was opened.

The new system removes the need to calculate/store the compressed SR2
payload as the public-link identity. It does NOT eliminate the need for
KV storage: the Worker still needs the selected item's data in order to
resolve a direct ID later.

A normal static asset request is not changed by this package.
