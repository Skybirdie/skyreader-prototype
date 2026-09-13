"use strict";

const CONTRACT_PREFIX = "sr2.";
const KEY_LENGTH = 16;

/* =========================================================
   Deterministic KV key generation
   Must match the key generator used by ShareManager / Glide.
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
   Validation
   ========================================================= */

function isValidKey(key) {
  return (
    typeof key === "string" &&
    key.length === KEY_LENGTH &&
    /^[A-Fa-f0-9]{16}$/.test(key)
  );
}

function isValidPayload(payload) {
  if (!payload) return false;

  if (!payload.startsWith(CONTRACT_PREFIX)) {
    return false;
  }

  const encoded = payload.slice(CONTRACT_PREFIX.length);

  if (!encoded) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(encoded);
}

/* =========================================================
   Response helpers
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
   Asset request
   Always serve the application's root index.html.

   This prevents the query-string share URL from causing
   the application to look for a physical file matching
   the URL path.
   ========================================================= */

function makeCleanAssetRequest(request) {
  const assetUrl = new URL(request.url);

  assetUrl.pathname = "/";
  assetUrl.search = "";
  assetUrl.hash = "";

  return new Request(assetUrl.toString(), {
    method: request.method,
    headers: request.headers
  });
}

/* =========================================================
   Inject recovered contract into index.html.

   The existing SkyMedia application already understands
   ?contractz=sr2....

   We recover the contract from KV and place it back into
   the URL before the application starts.
   ========================================================= */

function injectContractBootstrap(html, payload) {
  const encodedPayload = JSON.stringify(payload);

  const script = `
<script>
(function () {
  "use strict";

  var payload = ${encodedPayload};

  if (!payload) return;

  try {
    var url = new URL(window.location.href);

    url.searchParams.delete("k");
    url.searchParams.set("contractz", payload);

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
  const index = html.indexOf(marker);

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
   Serve index.html with a recovered contract.
   ========================================================= */

async function serveWithContract(request, env, payload) {
  const assetResponse = await env.ASSETS.fetch(
    makeCleanAssetRequest(request)
  );

  if (!assetResponse.ok) {
    return assetResponse;
  }

  const contentType =
    assetResponse.headers.get("content-type") || "";

  if (!contentType
    .toLowerCase()
    .includes("text/html")) {
    return assetResponse;
  }

  const html = await assetResponse.text();

  const modified = injectContractBootstrap(
    html,
    payload
  );

  return new Response(modified, {
    status: 200,
    headers: htmlHeaders()
  });
}

/* =========================================================
   Worker
   ========================================================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const keyParam =
      url.searchParams.get("k");

    const contractz =
      url.searchParams.get("contractz");

    /* =====================================================
       FIRST USE

       URL:

       ?k=<key>&contractz=<payload>&section=...&id=...

       Store the full contract in KV, then redirect to the
       clean URL without the contract.
       ===================================================== */

    if (keyParam && contractz) {
      const normalizedKey =
        keyParam.trim().toUpperCase();

      if (
        !isValidKey(normalizedKey) ||
        !isValidPayload(contractz)
      ) {
        return new Response(
          "SkyMedia publication link is invalid.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }

      /*
       * Calculate the expected key from the supplied
       * contract.
       *
       * The calculated value should normally equal the
       * supplied key. We enforce that relationship here
       * so a malformed/mismatched share URL cannot store
       * the contract under an unrelated key.
       */
      const calculatedKey =
        makeKey(contractz);

      if (calculatedKey !== normalizedKey) {
        return new Response(
          "SkyMedia publication link is invalid.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }

      /* Store contract in KV. */
      try {
        await env.MEDIA_KV.put(
          normalizedKey,
          contractz
        );
      } catch (error) {
        return new Response(
          "SkyMedia KV write failed.",
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      /*
       * Verify the write immediately.
       *
       * This protects against proceeding to the clean URL
       * if the KV write was not successful.
       */
      let storedPayload = null;

      try {
        storedPayload =
          await env.MEDIA_KV.get(normalizedKey);
      } catch (error) {
        return new Response(
          "SkyMedia KV verification read failed.",
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      if (storedPayload !== contractz) {
        return new Response(
          "SkyMedia KV verification failed.",
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      /*
       * Remove only the long contract from the URL.
       *
       * Keep:
       *   k
       *   section
       *   id
       * and any other legitimate application parameters.
       */
      const cleanUrl =
        new URL(request.url);

      cleanUrl.searchParams.delete(
        "contractz"
      );

      return Response.redirect(
        cleanUrl.toString(),
        302
      );
    }

    /* =====================================================
       CLEAN SHORT LINK

       URL:

       ?k=<key>&section=...&id=...

       Retrieve the contract from KV and inject it into
       index.html.
       ===================================================== */

    if (keyParam) {
      const normalizedKey =
        keyParam.trim().toUpperCase();

      if (!isValidKey(normalizedKey)) {
        return new Response(
          "SkyMedia publication key is invalid.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }

      let payload = null;

      try {
        payload =
          await env.MEDIA_KV.get(
            normalizedKey
          );
      } catch (error) {
        return new Response(
          "SkyMedia KV read failed.",
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      if (!payload) {
        return new Response(
          "SkyMedia publication not found.",
          {
            status: 404,
            headers: textHeaders()
          }
        );
      }

      if (!isValidPayload(payload)) {
        return new Response(
          "SkyMedia publication data is invalid.",
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      /*
       * Serve the application with the recovered contract.
       */
      return serveWithContract(
        request,
        env,
        payload
      );
    }

    /* =====================================================
       LEGACY DIRECT CONTRACT

       Existing URLs such as:

       ?contractz=sr2....

       continue to work.
       ===================================================== */

    if (contractz) {
      if (!isValidPayload(contractz)) {
        return new Response(
          "SkyMedia contract is invalid.",
          {
            status: 400,
            headers: textHeaders()
          }
        );
      }

      return serveWithContract(
        request,
        env,
        contractz
      );
    }

    /* =====================================================
       NORMAL REQUEST

       No KV key and no direct contract.

       Let Static Assets handle the normal application.
       ===================================================== */

    return env.ASSETS.fetch(request);
  }
};