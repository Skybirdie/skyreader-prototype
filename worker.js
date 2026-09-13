"use strict";

/*
============================================================
SkyMedia Cloudflare Worker
KV-backed contract lookup

SUPPORTED URL TYPES

1. Existing long contract URL:
   ?contractz=sr2.<payload>

2. First-use KV URL:
   ?k=<key>&contractz=sr2.<payload>

3. Stored short URL:
   ?k=<key>

4. Direct application route:
   ?section=slideshow&id=<item-id>

============================================================

IMPORTANT

- wrangler.jsonc is NOT changed by this Worker.
- MEDIA_KV must already be bound.
- ASSETS must already be bound.
- The Worker does NOT modify the SkyMedia application files.
- The KV diagnostic endpoint is temporary and can be removed
  after KV operation has been confirmed.
============================================================
*/


/* =========================================================
   CONSTANTS
   ========================================================= */

const CONTRACT_PREFIX = "sr2.";
const KEY_LENGTH = 16;


/* =========================================================
   FNV-1A KEY FUNCTIONS

   These match the key generator used by Glide.

   NOTE:
   The Worker no longer REQUIRES the supplied key to match
   the calculated key before storing. The supplied key is
   treated as the authoritative KV key.

   This removes an unnecessary failure point between Glide
   and Cloudflare.
   ========================================================= */

function fnv1a32(value, seed) {
  let hash = (0x811c9dc5 ^ seed) >>> 0;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}


function hex8(value) {
  return value
    .toString(16)
    .padStart(8, "0")
    .toUpperCase();
}


function makeKey(payload) {
  const hash1 = fnv1a32(payload, 0);
  const hash2 = fnv1a32(payload, 0x9E3779B9);

  return hex8(hash1) + hex8(hash2);
}


/* =========================================================
   VALIDATION
   ========================================================= */

function isValidKey(key) {
  return (
    typeof key === "string" &&
    key.length === KEY_LENGTH &&
    /^[A-Fa-f0-9]{16}$/.test(key)
  );
}


function isValidPayload(payload) {
  if (!payload) {
    return false;
  }

  if (!payload.startsWith(CONTRACT_PREFIX)) {
    return false;
  }

  const encoded =
    payload.slice(
      CONTRACT_PREFIX.length
    );

  if (!encoded) {
    return false;
  }

  /*
  Base64URL characters only.
  */
  return /^[A-Za-z0-9_-]+$/.test(encoded);
}


/* =========================================================
   COMMON RESPONSE HEADERS
   ========================================================= */

function htmlHeaders() {
  return {
    "content-type": "text/html; charset=UTF-8",
    "cache-control": "no-store, no-cache, must-revalidate",
    "pragma": "no-cache"
  };
}


function textHeaders() {
  return {
    "content-type": "text/plain; charset=UTF-8",
    "cache-control": "no-store, no-cache, must-revalidate",
    "pragma": "no-cache"
  };
}


/* =========================================================
   CLEAN ASSET REQUEST

   IMPORTANT:

   We explicitly request "/" with NO query string.

   The old version used:

       new URL("/", request.url)

   which could retain the original query parameters.

   This version deliberately removes the query parameters
   before asking Cloudflare Assets for index.html.
   ========================================================= */

function makeCleanAssetRequest(request) {
  const assetUrl =
    new URL(
      request.url
    );

  assetUrl.pathname = "/";
  assetUrl.search = "";
  assetUrl.hash = "";

  return new Request(
    assetUrl.toString(),
    {
      method: request.method,
      headers: request.headers
    }
  );
}


/* =========================================================
   CONTRACT BOOTSTRAP INJECTION

   The recovered contract is inserted into <head>.

   The application itself continues to use its existing
   contractz decoder.

   We also preserve all existing query parameters such as:

       section
       id

   while replacing only the KV key and contractz state.
   ========================================================= */

function injectContractBootstrap(
  html,
  payload
) {
  const encodedPayload =
    JSON.stringify(payload);

  const script = `
<script>
(function () {
  "use strict";

  /*
   * SkyMedia KV contract bootstrap.
   *
   * The Worker recovered this contract from Cloudflare KV.
   * Put it into the URL before SkyMedia application scripts
   * begin processing the page.
   */

  var payload = ${encodedPayload};

  if (!payload) {
    return;
  }

  try {
    var url =
      new URL(
        window.location.href
      );

    /*
     * Remove the KV lookup key because the contract has
     * already been recovered.
     */
    url.searchParams.delete("k");

    /*
     * Supply the recovered C2.2 contract in the same form
     * understood by the existing SkyMedia application.
     */
    url.searchParams.set(
      "contractz",
      payload
    );

    /*
     * IMPORTANT:
     *
     * Do NOT remove:
     *
     *   section
     *   id
     *
     * or any other application parameters.
     *
     * They remain available to the application.
     */

    window.history.replaceState(
      null,
      "",
      url.pathname +
      "?" +
      url.searchParams.toString() +
      url.hash
    );

  } catch (error) {

    console.error(
      "SkyMedia KV bootstrap failed:",
      error
    );

  }

})();
</script>
`;

  const marker =
    "</head>";

  const index =
    html.indexOf(marker);

  if (index < 0) {
    /*
     * If the marker is unexpectedly absent, return the
     * original document rather than corrupting it.
     */
    return html;
  }

  return (
    html.slice(0, index) +
    script +
    html.slice(index)
  );
}


/* =========================================================
   SERVE SKYMEDIA INDEX WITH CONTRACT
   ========================================================= */

async function serveWithContract(
  request,
  env,
  payload
) {
  /*
   * Ask Assets specifically for the clean root page.
   *
   * No k=...
   * No contractz=...
   *
   * The contract will be injected below.
   */
  const assetResponse =
    await env.ASSETS.fetch(
      makeCleanAssetRequest(request)
    );

  if (!assetResponse.ok) {
    return assetResponse;
  }

  const contentType =
    assetResponse.headers.get(
      "content-type"
    ) || "";

  /*
   * We only inject into HTML.
   */
  if (
    !contentType
      .toLowerCase()
      .includes("text/html")
  ) {
    return assetResponse;
  }

  const html =
    await assetResponse.text();

  const modified =
    injectContractBootstrap(
      html,
      payload
    );

  return new Response(
    modified,
    {
      status: 200,
      headers: htmlHeaders()
    }
  );
}


/* =========================================================
   TEMPORARY KV DIAGNOSTIC

   URL:

       /__skymedia_kv?k=<key>

   Example:

       https://skyreader-prototype.sliburd81.workers.dev/
       ?__skymedia_kv=1&k=33328C6C09DAF837

   This tells us whether the KV namespace can retrieve
   the stored contract.

   It does NOT expose the entire contract.

   It reports:
     - key
     - whether KV found it
     - payload length
     - payload prefix
     - calculated key
     - whether calculated key matches

   This endpoint can be removed after testing.
   ========================================================= */

async function handleKVDiagnostic(
  request,
  env
) {
  const url =
    new URL(request.url);

  const key =
    url.searchParams.get("k");

  if (!key) {
    return new Response(
      "KV diagnostic requires ?k=<16-character-key>",
      {
        status: 400,
        headers: textHeaders()
      }
    );
  }

  if (!isValidKey(key)) {
    return new Response(
      "Invalid KV key. Expected 16 hexadecimal characters.",
      {
        status: 400,
        headers: textHeaders()
      }
    );
  }

  const normalizedKey =
    key.toUpperCase();

  let payload = null;

  try {
    payload =
      await env.MEDIA_KV.get(
        normalizedKey
      );
  } catch (error) {
    return new Response(
      "KV READ ERROR\n\n" +
      String(error),
      {
        status: 500,
        headers: textHeaders()
      }
    );
  }

  if (!payload) {
    return new Response(
      [
        "SkyMedia KV diagnostic",
        "",
        "Key: " + normalizedKey,
        "Found: NO",
        "",
        "The Worker can access MEDIA_KV, but no value",
        "currently exists under this key."
      ].join("\n"),
      {
        status: 404,
        headers: textHeaders()
      }
    );
  }

  const calculatedKey =
    makeKey(payload);

  return new Response(
    [
      "SkyMedia KV diagnostic",
      "",
      "Key: " + normalizedKey,
      "Found: YES",
      "Payload length: " + payload.length,
      "Payload prefix: " +
        payload.slice(0, 20),
      "Calculated key: " +
        calculatedKey,
      "Calculated key matches: " +
        (
          calculatedKey ===
          normalizedKey
        )
    ].join("\n"),
    {
      status: 200,
      headers: textHeaders()
    }
  );
}


/* =========================================================
   MAIN WORKER
   ========================================================= */

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(
        request.url
      );


    /* =====================================================
       METHOD CHECK
       ===================================================== */

    if (
      request.method !== "GET" &&
      request.method !== "HEAD"
    ) {
      return new Response(
        "Method Not Allowed",
        {
          status: 405,
          headers: {
            "allow": "GET, HEAD"
          }
        }
      );
    }


    /* =====================================================
       TEMPORARY KV DIAGNOSTIC

       Activate by adding:

           ?__skymedia_kv=1&k=...

       This check occurs before normal routing.
       ===================================================== */

    if (
  url.pathname === "/__skymedia_kv"
) {
  return handleKVDiagnostic(
    request,
    env
  );
}


    /* =====================================================
       READ QUERY PARAMETERS
       ===================================================== */

    const key =
      url.searchParams.get(
        "k"
      );

    const suppliedPayload =
      url.searchParams.get(
        "contractz"
      );


    /* =====================================================
       1. FIRST-USE KV URL

       Expected:

           ?k=<key>&contractz=sr2.<payload>

       Store payload in KV.

       Then redirect to:

           ?k=<key>

       ===================================================== */

    if (
      key &&
      suppliedPayload
    ) {

      /*
       * Validate key format.
       */
      if (
        !isValidKey(key)
      ) {
        return new Response(
          "Invalid SkyMedia key.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }


      /*
       * Validate contract format.
       */
      if (
        !isValidPayload(
          suppliedPayload
        )
      ) {
        return new Response(
          "Invalid SkyMedia contract.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }


      /*
       * IMPORTANT:
       *
       * The supplied key is now authoritative.
       *
       * We do NOT reject the request merely because our
       * independently calculated FNV value differs.
       *
       * This eliminates an unnecessary compatibility
       * failure between Glide and the Worker.
       */
      const normalizedKey =
        key.toUpperCase();


      /*
       * Store the exact C2.2 payload.
       */
      try {

        await env.MEDIA_KV.put(
          normalizedKey,
          suppliedPayload
        );

      } catch (error) {

        return new Response(
          "SkyMedia KV write failed.\n\n" +
          String(error),
          {
            status: 500,
            headers: textHeaders()
          }
        );

      }


      /*
       * Build the short URL.
       *
       * Preserve everything except contractz.
       *
       * In particular, preserve:
       *
       *   section
       *   id
       *
       * if they were included in the original URL.
       */
      const shortUrl =
        new URL(
          url.href
        );

      shortUrl.searchParams.delete(
        "contractz"
      );

      shortUrl.searchParams.set(
        "k",
        normalizedKey
      );


      /*
       * Redirect to the KV-only URL.
       */
      return Response.redirect(
        shortUrl.toString(),
        302
      );
    }


    /* =====================================================
       2. SHORT KV URL

       Expected:

           ?k=<key>

       Retrieve contract from KV.

       Then serve SkyMedia index.html with the recovered
       contract injected before application startup.
       ===================================================== */

    if (key) {

      /*
       * Validate key.
       */
      if (
        !isValidKey(key)
      ) {
        return new Response(
          "Invalid SkyMedia key.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }

      const normalizedKey =
        key.toUpperCase();


      /*
       * Read KV.
       */
      let payload = null;

      try {

        payload =
          await env.MEDIA_KV.get(
            normalizedKey
          );

      } catch (error) {

        return new Response(
          "SkyMedia KV read failed.\n\n" +
          String(error),
          {
            status: 500,
            headers: textHeaders()
          }
        );

      }


      /*
       * Nothing found.
       */
      if (!payload) {

        return new Response(
          "SkyMedia publication not found.",
          {
            status: 404,
            headers: textHeaders()
          }
        );

      }


      /*
       * Validate what came back from KV.
       */
      if (
        !isValidPayload(
          payload
        )
      ) {

        return new Response(
          "SkyMedia publication data is invalid.",
          {
            status: 500,
            headers: textHeaders()
          }
        );

      }


      /*
       * Serve application with recovered contract.
       */
      return serveWithContract(
        request,
        env,
        payload
      );
    }


    /* =====================================================
       3. EXISTING LONG C2.2 URL

       Expected:

           ?contractz=sr2.<payload>

       This remains fully supported.

       No KV storage is required for this path.
       ===================================================== */

    if (
      suppliedPayload
    ) {

      if (
        !isValidPayload(
          suppliedPayload
        )
      ) {
        return new Response(
          "Invalid SkyMedia contract.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }


      return serveWithContract(
        request,
        env,
        suppliedPayload
      );
    }


    /* =====================================================
       4. NORMAL STATIC SITE REQUEST

       No KV key.
       No contract.

       Pass request directly to Cloudflare Assets.

       This preserves ordinary:
         /
         /index.html
         /reader.html
         /video.html
         /assets/...
         etc.
       ===================================================== */

    return env.ASSETS.fetch(
      request
    );
  }
};
