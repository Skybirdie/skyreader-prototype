"use strict";

/*
============================================================
SkyMedia Cloudflare Worker
KV-backed contract lookup

CURRENT PURPOSE

This version is deliberately diagnostic.

It establishes exactly what happens when Glide sends:

    ?k=<key>&contractz=sr2.<payload>

The Worker will:

1. Validate the key.
2. Validate the contract.
3. Write the contract to MEDIA_KV.
4. Immediately read it back.
5. Only redirect if the write/read succeeds.

It also supports:

    ?k=<key>

and existing:

    ?contractz=sr2.<payload>

Diagnostic routes:

    /__skymedia_kv?k=<key>

    /__skymedia_kv_write

============================================================
*/

const CONTRACT_PREFIX = "sr2.";
const KEY_LENGTH = 16;


/* =========================================================
   KEY HELPERS
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

  return /^[A-Za-z0-9_-]+$/.test(encoded);
}


/* =========================================================
   RESPONSE HEADERS
   ========================================================= */

function htmlHeaders() {
  return {
    "content-type": "text/html; charset=UTF-8",
    "cache-control":
      "no-store, no-cache, must-revalidate",
    "pragma": "no-cache"
  };
}


function textHeaders() {
  return {
    "content-type": "text/plain; charset=UTF-8",
    "cache-control":
      "no-store, no-cache, must-revalidate",
    "pragma": "no-cache"
  };
}


/* =========================================================
   CLEAN ASSET REQUEST
   ========================================================= */

function makeCleanAssetRequest(request) {
  const assetUrl =
    new URL(request.url);

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
   CONTRACT BOOTSTRAP
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
     * The KV key has already been resolved.
     */
    url.searchParams.delete("k");

    /*
     * Put the recovered C2.2 contract back into the
     * URL in exactly the format the existing application
     * already understands.
     */
    url.searchParams.set(
      "contractz",
      payload
    );

    /*
     * Preserve section, id, and all other parameters.
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

  const marker = "</head>";

  const index =
    html.indexOf(marker);

  if (index < 0) {
    return html;
  }

  return (
    html.slice(0, index) +
    script +
    html.slice(index)
  );
}


/* =========================================================
   SERVE SKYMEDIA WITH CONTRACT
   ========================================================= */

async function serveWithContract(
  request,
  env,
  payload
) {
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
   KV READ DIAGNOSTIC
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
      [
        "SkyMedia KV diagnostic",
        "",
        "No key supplied.",
        "",
        "Use:",
        "/__skymedia_kv?k=<16-character-key>"
      ].join("\n"),
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
      [
        "SkyMedia KV diagnostic",
        "",
        "READ ERROR",
        "",
        String(error)
      ].join("\n"),
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
        "No value exists under this key."
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
   KV WRITE DIAGNOSTIC
   ========================================================= */

async function handleKVWriteDiagnostic(
  request,
  env
) {
  const testKey =
    "SKYMEDIA_WRITE_TEST";

  const testValue =
    "SkyMedia KV write test successful";

  try {

    await env.MEDIA_KV.put(
      testKey,
      testValue
    );

    const value =
      await env.MEDIA_KV.get(
        testKey
      );

    return new Response(
      [
        "SkyMedia KV write diagnostic",
        "",
        "Write: SUCCESS",
        "Read immediately after write: " +
          (value || "NO VALUE"),
        "",
        "MEDIA_KV is working for both write and read."
      ].join("\n"),
      {
        status: 200,
        headers: textHeaders()
      }
    );

  } catch (error) {

    return new Response(
      [
        "SkyMedia KV write diagnostic",
        "",
        "Write: FAILED",
        "",
        String(error)
      ].join("\n"),
      {
        status: 500,
        headers: textHeaders()
      }
    );
  }
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
       DIAGNOSTIC ROUTES
       ===================================================== */

    if (
      url.pathname ===
      "/__skymedia_kv"
    ) {
      return handleKVDiagnostic(
        request,
        env
      );
    }


    if (
      url.pathname ===
      "/__skymedia_kv_write"
    ) {
      return handleKVWriteDiagnostic(
        request,
        env
      );
    }


    /* =====================================================
       QUERY PARAMETERS
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
       FIRST-USE KV URL

       ?k=<key>&contractz=sr2.<payload>

       THIS MUST BE HANDLED BEFORE NORMAL ASSET ROUTING.
       ===================================================== */

    if (
      key &&
      suppliedPayload
    ) {

      /*
       * Basic key validation.
       */
      if (
        !isValidKey(key)
      ) {

        return new Response(
          [
            "SkyMedia first-use URL error",
            "",
            "Invalid key.",
            "",
            "Received key length: " +
              String(key.length),
            "Received key: " +
              key
          ].join("\n"),
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }


      /*
       * Contract validation.
       */
      if (
        !isValidPayload(
          suppliedPayload
        )
      ) {

        return new Response(
          [
            "SkyMedia first-use URL error",
            "",
            "Invalid contract.",
            "",
            "Payload length: " +
              String(
                suppliedPayload.length
              ),
            "Payload prefix: " +
              suppliedPayload.slice(0, 30)
          ].join("\n"),
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }


      const normalizedKey =
        key.toUpperCase();


      /*
       * Calculate the expected key ONLY for diagnostic
       * information.
       *
       * We do NOT reject the supplied key if it differs.
       */
      const calculatedKey =
        makeKey(
          suppliedPayload
        );


      /* ===================================================
         WRITE
         =================================================== */

      try {

        await env.MEDIA_KV.put(
          normalizedKey,
          suppliedPayload
        );

      } catch (error) {

        return new Response(
          [
            "SkyMedia first-use KV WRITE FAILED",
            "",
            "Key: " +
              normalizedKey,
            "Payload length: " +
              suppliedPayload.length,
            "Calculated key: " +
              calculatedKey,
            "",
            "ERROR:",
            String(error)
          ].join("\n"),
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }


      /* ===================================================
         IMMEDIATE READ-BACK VERIFICATION
         =================================================== */

      let storedPayload = null;

      try {

        storedPayload =
          await env.MEDIA_KV.get(
            normalizedKey
          );

      } catch (error) {

        return new Response(
          [
            "SkyMedia first-use KV READ-BACK FAILED",
            "",
            "The write appeared to succeed, but the",
            "immediate verification read failed.",
            "",
            "Key: " +
              normalizedKey,
            "",
            "ERROR:",
            String(error)
          ].join("\n"),
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }


      /* ===================================================
         VERIFY VALUE
         =================================================== */

      if (
        storedPayload !==
        suppliedPayload
      ) {

        return new Response(
          [
            "SkyMedia first-use KV VERIFICATION FAILED",
            "",
            "Key: " +
              normalizedKey,
            "",
            "Supplied payload length: " +
              suppliedPayload.length,
            "Stored payload length: " +
              (
                storedPayload
                  ? storedPayload.length
                  : 0
              ),
            "",
            "The value stored in KV does not exactly",
            "match the supplied contract."
          ].join("\n"),
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }


      /* ===================================================
         SUCCESSFUL FIRST USE
         =================================================== */

      /*
       * Preserve every application parameter except
       * contractz.
       *
       * Therefore:
       *
       *   section
       *   id
       *
       * remain intact if present.
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
       * Redirect only after KV has been proven to contain
       * the exact payload.
       */
      return Response.redirect(
        shortUrl.toString(),
        302
      );
    }


    /* =====================================================
       SHORT KV URL

       ?k=<key>
       ===================================================== */

    if (key) {

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

      let payload = null;

      try {

        payload =
          await env.MEDIA_KV.get(
            normalizedKey
          );

      } catch (error) {

        return new Response(
          [
            "SkyMedia KV read failed.",
            "",
            String(error)
          ].join("\n"),
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }


      if (!payload) {

        return new Response(
          [
            "SkyMedia publication not found.",
            "",
            "KV key: " +
              normalizedKey
          ].join("\n"),
          {
            status: 404,
            headers: textHeaders()
          }
        );
      }


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


      return serveWithContract(
        request,
        env,
        payload
      );
    }


    /* =====================================================
       EXISTING LONG C2.2 URL

       ?contractz=sr2.<payload>
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
       NORMAL SKYMEDIA REQUEST
       ===================================================== */

    return env.ASSETS.fetch(
      request
    );
  }
};
