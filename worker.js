"use strict";

const CONTRACT_PREFIX = "sr2.";
const KEY_LENGTH = 16;

function fnv1a32(value, seed) {
  let hash = (0x811c9dc5 ^ seed) >>> 0;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

function hex8(value) {
  return value.toString(16).padStart(8, "0").toUpperCase();
}

function makeKey(payload) {
  const hash1 = fnv1a32(payload, 0);
  const hash2 = fnv1a32(payload, 0x9E3779B9);

  return hex8(hash1) + hex8(hash2);
}

function isValidKey(key) {
  return typeof key === "string" &&
    key.length === KEY_LENGTH &&
    /^[A-Fa-f0-9]{16}$/.test(key);
}

function isValidPayload(payload) {
  if (!payload) return false;
  if (!payload.startsWith(CONTRACT_PREFIX)) return false;

  const encoded = payload.slice(CONTRACT_PREFIX.length);

  if (!encoded) return false;

  return /^[A-Za-z0-9_-]+$/.test(encoded);
}

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
      url.pathname + "?" + url.searchParams.toString() + url.hash
    );
  } catch (error) {
    console.error("SkyMedia KV bootstrap failed:", error);
  }
})();
</script>
`;

  const marker = "</head>";
  const index = html.indexOf(marker);

  if (index < 0) return html;

  return html.slice(0, index) + script + html.slice(index);
}

async function serveWithContract(request, env, payload) {
  const assetResponse = await env.ASSETS.fetch(
    makeCleanAssetRequest(request)
  );

  if (!assetResponse.ok) return assetResponse;

  const contentType =
    assetResponse.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("text/html")) {
    return assetResponse;
  }

  const html = await assetResponse.text();

  const modified = injectContractBootstrap(html, payload);

  return new Response(modified, {
    status: 200,
    headers: htmlHeaders()
  });
}

async function handleKVTrace(request, env) {
  const url = new URL(request.url);

  const suppliedKey = url.searchParams.get("k") || "";
  const section = url.searchParams.get("section") || "";
  const id = url.searchParams.get("id") || "";
  const suppliedPayload = url.searchParams.get("contractz") || "";

  const lines = [];

  lines.push("SkyMedia KV trace");
  lines.push("=================");
  lines.push("");

  lines.push("Pathname: " + url.pathname);
  lines.push("Method: " + request.method);
  lines.push("");

  lines.push("Supplied key: " + (suppliedKey || "(none)"));
  lines.push("Key length: " + suppliedKey.length);
  lines.push("Key valid: " + isValidKey(suppliedKey));
  lines.push("");

  lines.push("Section: " + (section || "(none)"));
  lines.push("ID: " + (id || "(none)"));
  lines.push("");

  lines.push(
    "URL has contractz: " +
    (suppliedPayload ? "YES" : "NO")
  );

  if (suppliedPayload) {
    lines.push("URL contract length: " + suppliedPayload.length);
    lines.push(
      "URL contract prefix valid: " +
      suppliedPayload.startsWith(CONTRACT_PREFIX)
    );
    lines.push(
      "URL contract valid: " +
      isValidPayload(suppliedPayload)
    );

    if (isValidPayload(suppliedPayload)) {
      lines.push(
        "Calculated key from URL contract: " +
        makeKey(suppliedPayload)
      );
    }
  }

  lines.push("");

  const normalizedKey = suppliedKey.trim().toUpperCase();

  lines.push("Normalized key: " + (normalizedKey || "(none)"));
  lines.push("");

  let kvPayload = null;
  let kvError = null;

  try {
    kvPayload = await env.MEDIA_KV.get(normalizedKey);
  } catch (error) {
    kvError = error;
  }

  lines.push(
    "MEDIA_KV.get completed: " +
    (kvError ? "NO" : "YES")
  );

  if (kvError) {
    lines.push(
      "KV error: " +
      String(kvError && kvError.message
        ? kvError.message
        : kvError)
    );
  }

  lines.push(
    "KV value found: " +
    (kvPayload !== null ? "YES" : "NO")
  );

  if (kvPayload !== null) {
    lines.push("KV payload length: " + kvPayload.length);
    lines.push(
      "KV payload prefix valid: " +
      kvPayload.startsWith(CONTRACT_PREFIX)
    );
    lines.push(
      "KV payload valid: " +
      isValidPayload(kvPayload)
    );

    if (isValidPayload(kvPayload)) {
      const calculatedKVKey = makeKey(kvPayload);

      lines.push(
        "Calculated key from KV payload: " +
        calculatedKVKey
      );

      lines.push(
        "KV calculated key matches supplied key: " +
        (
          isValidKey(normalizedKey) &&
          calculatedKVKey === normalizedKey
        )
      );
    }

    if (suppliedPayload) {
      lines.push(
        "KV payload equals URL payload: " +
        (kvPayload === suppliedPayload)
      );
    }
  }

  lines.push("");
  lines.push("Final result:");

  if (!isValidKey(normalizedKey)) {
    lines.push("INVALID KEY");
  } else if (kvError) {
    lines.push("KV READ ERROR");
  } else if (kvPayload === null) {
    lines.push("KEY NOT FOUND");
  } else if (!isValidPayload(kvPayload)) {
    lines.push("KV PAYLOAD INVALID");
  } else {
    lines.push("KEY FOUND AND PAYLOAD VALID");
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: textHeaders()
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const trace =
      url.searchParams.get("__skymedia_trace") === "1";

    if (trace) {
      return handleKVTrace(request, env);
    }

    const keyParam = url.searchParams.get("k");
    const contractz = url.searchParams.get("contractz");

    /*
     * FIRST USE:
     *
     * ?k=<key>&contractz=<payload>
     *
     * Store the supplied contract in KV, then redirect
     * to the clean k URL.
     */
    if (keyParam && contractz) {
      const normalizedKey = keyParam.trim().toUpperCase();

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

      const calculatedKey = makeKey(contractz);

      /*
       * The supplied key should correspond to the payload.
       * We don't reject it here so the diagnostic behavior
       * remains visible while testing.
       */

      try {
        await env.MEDIA_KV.put(
          normalizedKey,
          contractz
        );
      } catch (error) {
        return new Response(
          "SkyMedia KV write failed.\n\n" +
          String(
            error && error.message
              ? error.message
              : error
          ),
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      let storedPayload = null;

      try {
        storedPayload =
          await env.MEDIA_KV.get(normalizedKey);
      } catch (error) {
        return new Response(
          "SkyMedia KV verification read failed.\n\n" +
          String(
            error && error.message
              ? error.message
              : error
          ),
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      if (storedPayload !== contractz) {
        return new Response(
          "SkyMedia KV verification failed.\n\n" +
          "The value written to KV could not be read back exactly.",
          {
            status: 500,
            headers: textHeaders()
          }
        );
      }

      const cleanUrl = new URL(request.url);

      cleanUrl.searchParams.delete("contractz");

      return Response.redirect(
        cleanUrl.toString(),
        302
      );
    }

    /*
     * CLEAN SHORT LINK:
     *
     * ?k=<key>
     *
     * Retrieve the contract from KV and inject it into
     * index.html.
     */
    if (keyParam) {
      const normalizedKey = keyParam.trim().toUpperCase();

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
          await env.MEDIA_KV.get(normalizedKey);
      } catch (error) {
        return new Response(
          "SkyMedia KV read failed.\n\n" +
          String(
            error && error.message
              ? error.message
              : error
          ),
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

      return serveWithContract(
        request,
        env,
        payload
      );
    }

    /*
     * LEGACY DIRECT CONTRACT:
     *
     * ?contractz=sr2....
     */
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

    /*
     * NORMAL REQUEST
     */
    return env.ASSETS.fetch(request);
  }
};