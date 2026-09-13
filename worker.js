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

    /* =====================================================
       SHARE PRIMING ENDPOINT

       IMPORTANT: this endpoint is checked BEFORE the normal
       k/contractz routing.  The previous version placed it
       after those handlers, so the priming request was caught
       by the normal first-use redirect and ShareManager then
       tried to parse an HTML response as JSON.

       POST is preferred because the compressed contract can be
       large.  A text/plain POST is used by the browser so the
       request remains a simple CORS request (no preflight).
       GET is retained for diagnostics/backward compatibility.
       ===================================================== */

    if (url.pathname === "/__sky_share_prime") {
      const corsHeaders = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store, no-cache, must-revalidate"
      };

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders
        });
      }

      let primeKey = "";
      let primeContract = "";
      let primeSection = "";
      let primeId = "";

      try {
        if (request.method === "POST") {
          const body = await request.text();
          const data = JSON.parse(body || "{}");

          primeKey = String(data.k || "");
          primeContract = String(data.contractz || "");
          primeSection = String(data.section || "");
          primeId = String(data.id || "");
        } else if (request.method === "GET") {
          primeKey = url.searchParams.get("k") || "";
          primeContract = url.searchParams.get("contractz") || "";
          primeSection = url.searchParams.get("section") || "";
          primeId = url.searchParams.get("id") || "";
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid share-prime method." }),
            { status: 405, headers: corsHeaders }
          );
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ error: "Invalid share-prime request body." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const normalizedPrimeKey = primeKey.trim().toUpperCase();

      if (
        !isValidKey(normalizedPrimeKey) ||
        !isValidPayload(primeContract)
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid share-prime data." }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (makeKey(primeContract) !== normalizedPrimeKey) {
        return new Response(
          JSON.stringify({ error: "Share-prime key mismatch." }),
          { status: 400, headers: corsHeaders }
        );
      }

      try {
        await env.MEDIA_KV.put(
          normalizedPrimeKey,
          primeContract
        );

        const storedPrimeContract =
          await env.MEDIA_KV.get(normalizedPrimeKey);

        if (storedPrimeContract !== primeContract) {
          throw new Error("KV verification failed.");
        }
      } catch (error) {
        console.error("SkyMedia share-prime KV failure:", error);

        return new Response(
          JSON.stringify({ error: "SkyMedia KV write failed." }),
          { status: 500, headers: corsHeaders }
        );
      }

      const cleanUrl = new URL(SKYMEDIA_BASE_URL);
      cleanUrl.searchParams.set("k", normalizedPrimeKey);

      if (primeSection) {
        cleanUrl.searchParams.set("section", primeSection);
      }

      if (primeId) {
        cleanUrl.searchParams.set("id", primeId);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          url: cleanUrl.toString()
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const keyParam = url.searchParams.get("k");
    const contractz = url.searchParams.get("contractz");

    /* =====================================================
       FIRST USE
       ===================================================== */

    if (keyParam && contractz) {
      const normalizedKey = keyParam.trim().toUpperCase();

      if (
        !isValidKey(normalizedKey) ||
        !isValidPayload(contractz)
      ) {
        return new Response(
          "SkyMedia publication link is invalid.",
          { status: 400, headers: textHeaders() }
        );
      }

      const calculatedKey = makeKey(contractz);

      if (calculatedKey !== normalizedKey) {
        return new Response(
          "SkyMedia publication link is invalid.",
          { status: 400, headers: textHeaders() }
        );
      }

      try {
        await env.MEDIA_KV.put(normalizedKey, contractz);

        const storedPayload =
          await env.MEDIA_KV.get(normalizedKey);

        if (storedPayload !== contractz) {
          throw new Error("KV verification failed.");
        }
      } catch (error) {
        console.error("SkyMedia first-use KV failure:", error);
        return new Response(
          "SkyMedia KV write/verification failed.",
          { status: 500, headers: textHeaders() }
        );
      }

      const cleanUrl = new URL(request.url);
      cleanUrl.searchParams.delete("contractz");

      return Response.redirect(cleanUrl.toString(), 302);
    }

    /* =====================================================
       CLEAN SHORT LINK
       ===================================================== */

    if (keyParam) {
      const normalizedKey = keyParam.trim().toUpperCase();

      if (!isValidKey(normalizedKey)) {
        return new Response(
          "SkyMedia publication key is invalid.",
          { status: 400, headers: textHeaders() }
        );
      }

      let payload = null;

      try {
        payload = await env.MEDIA_KV.get(normalizedKey);
      } catch (error) {
        return new Response(
          "SkyMedia KV read failed.",
          { status: 500, headers: textHeaders() }
        );
      }

      if (!payload) {
        return new Response(
          "SkyMedia publication not found.",
          { status: 404, headers: textHeaders() }
        );
      }

      if (!isValidPayload(payload)) {
        return new Response(
          "SkyMedia publication data is invalid.",
          { status: 500, headers: textHeaders() }
        );
      }

      return serveWithContract(request, env, payload);
    }

    /* =====================================================
       LEGACY DIRECT CONTRACT
       ===================================================== */

    if (contractz) {
      if (!isValidPayload(contractz)) {
        return new Response(
          "SkyMedia contract is invalid.",
          { status: 400, headers: textHeaders() }
        );
      }

      return serveWithContract(request, env, contractz);
    }

    /* =====================================================
       NORMAL REQUEST
       ===================================================== */

    return env.ASSETS.fetch(request);
  }
};
