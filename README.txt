MMicjMedia Worker — idempotent catalog publish change

This package contains the existing worker.js with the catalog publisher changed so that:

1. Each incoming catalog item is normalized exactly as before.
2. The existing KV catalog record is read with an uncached KV get.
3. publishedAt is excluded from the comparison.
4. KV.put() is called only when the record is new, changed, or malformed.
5. Repeating the same publish request does not rewrite unchanged catalog items.
6. The response reports unchangedCount separately from storedCount.

Important:
Cloudflare Workers KV still counts one KV write per key written. Sending many changed items in one HTTP request does NOT make those KV writes count as one KV write. A true one-KV-write bulk snapshot would require storing the whole catalog as one KV value and changing the catalog lookup architecture.

The existing catalog:test:last status record is still written once per publish request in this version. That is separate from item writes. If you want absolutely zero KV writes when nothing changed, the next change should make the status record write conditional on storedCount > 0 (or move status reporting entirely to the HTTP response).


Link-preview badge (the logo in the corner of shared item previews)
------------------------------------------------------------------
The badge drawn on every item preview (WhatsApp etc.) is assets/logo-badge.png,
a copy of assets/logo.png with the transparent margins cropped off. The Worker
reads it from its own static assets (OG_LOGO_PATH in worker.js).

After changing assets/logo.png, regenerate the trimmed copy:

  python3 -c "from PIL import Image; im=Image.open('assets/logo.png').convert('RGBA'); im.crop(im.getchannel('A').getbbox()).save('assets/logo-badge.png', optimize=True)"

then bump OG_CACHE_VERSION in worker.js (stored previews are rebuilt) and deploy.
Chat apps keep their own copy of a preview for a while; see the deploy notes.
