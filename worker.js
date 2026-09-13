"use strict";

/*
============================================================
SkyMedia Cloudflare Worker
KV-backed contract lookup

Responsibilities:

1. Preserve existing:
      ?contractz=sr2.<payload>

2. Register first-use:
      ?k=<key>&contractz=sr2.<payload>

3. Store the contract payload in MEDIA_KV.

4. Redirect first-use URLs to:
      ?k=<key>

5. Resolve short:
      ?k=<key>

6. Inject the recovered contractz into the page before
   SkyMedia's existing application scripts initialize.

7. Pass all ordinary static assets through Cloudflare Assets.

============================================================
*/


const CONTRACT_PREFIX = "sr2.";

const KEY_LENGTH = 16;


/* ----------------------------------------------------------
   Deterministic key generation
   ---------------------------------------------------------- */

function fnv1a32(value, seed) {

  let hash =
    (0x811c9dc5 ^ seed) >>> 0;

  for (
    let i = 0;
    i < value.length;
    i++
  ) {

    hash ^= value.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        0x01000193
      ) >>> 0;
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

  const hash1 =
    fnv1a32(
      payload,
      0
    );

  const hash2 =
    fnv1a32(
      payload,
      0x9E3779B9
    );

  return (
    hex8(hash1) +
    hex8(hash2)
  );
}


/* ----------------------------------------------------------
   Basic contract validation
   ---------------------------------------------------------- */

function isValidPayload(payload) {

  if (!payload) {
    return false;
  }

  if (!payload.startsWith(CONTRACT_PREFIX)) {
    return false;
  }

  /*
  sr2. payloads are Base64URL after the prefix.
  */

  const encoded =
    payload.slice(
      CONTRACT_PREFIX.length
    );

  if (!encoded) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(
    encoded
  );
}


/* ----------------------------------------------------------
   HTML response helpers
   ---------------------------------------------------------- */

function htmlHeaders() {

  return {
    "content-type": "text/html; charset=UTF-8",
    "cache-control": "no-store"
  };
}


/*
Inject a tiny bootstrap script immediately before </head>.

The script changes:

    ?k=ABC

into:

    ?contractz=sr2....

using history.replaceState().

This means the existing SkyMedia application can continue
using its current C2.2 contract reader without becoming
KV-aware.
*/

function injectContractBootstrap(
  html,
  payload
) {

  const encodedPayload =
    JSON.stringify(
      payload
    );

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

    url.searchParams.delete("k");

    url.searchParams.set(
      "contractz",
      payload
    );

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
    html.indexOf(
      marker
    );


  if (index < 0) {

    /*
    Extremely unlikely, but return the original page
    rather than corrupting it.
    */

    return html;
  }


  return (
    html.slice(
      0,
      index
    ) +
    script +
    html.slice(
      index
    )
  );
}


/* ----------------------------------------------------------
   Serve the SkyMedia application with a recovered contract
   ---------------------------------------------------------- */

async function serveWithContract(
  request,
  env,
  payload
) {

  const assetResponse =
    await env.ASSETS.fetch(
      new Request(
        new URL(
          "/",
          request.url
        ),
        request
      )
    );


  if (!assetResponse.ok) {

    return assetResponse;
  }


  const contentType =
    assetResponse.headers.get(
      "content-type"
    ) ||
    "";


  /*
  We only modify HTML.

  Static JS/CSS/images are returned unchanged.
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


/* ----------------------------------------------------------
   Main Worker
   ---------------------------------------------------------- */

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(
        request.url
      );


    /*
    --------------------------------------------------------
    Only GET/HEAD are relevant to the public viewing system.
    --------------------------------------------------------
    */

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


    /*
    --------------------------------------------------------
    1. FIRST-USE URL

       ?k=<key>&contractz=sr2.<payload>

       Store the payload in KV.
    --------------------------------------------------------
    */

    const key =
      url.searchParams.get(
        "k"
      );


    const suppliedPayload =
      url.searchParams.get(
        "contractz"
      );


    if (
      key &&
      suppliedPayload
    ) {

      /*
      Reject malformed keys.
      */

      if (
        key.length !== KEY_LENGTH ||
        !/^[A-Fa-f0-9]{16}$/.test(key)
      ) {

        return new Response(
          "Invalid SkyMedia key.",
          {
            status: 400
          }
        );
      }


      /*
      Validate the C2.2 payload.
      */

      if (
        !isValidPayload(
          suppliedPayload
        )
      ) {

        return new Response(
          "Invalid SkyMedia contract.",
          {
            status: 400
          }
        );
      }


      /*
      Verify that the key actually belongs to this
      contract.

      This prevents somebody from deliberately storing
      unrelated data under an arbitrary key.
      */

      const expectedKey =
        makeKey(
          suppliedPayload
        );


      if (
        key.toUpperCase() !==
        expectedKey
      ) {

        return new Response(
          "SkyMedia key does not match contract.",
          {
            status: 400
          }
        );
      }


      /*
      Store the C2.2 payload.

      The key itself is the KV key.

      We intentionally store only the compressed contract
      payload rather than media files.
      */

      await env.MEDIA_KV.put(
        expectedKey,
        suppliedPayload
      );


      /*
      Now remove the long contract from the browser URL.
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
        expectedKey
      );


      return Response.redirect(
        shortUrl.toString(),
        302
      );
    }


    /*
    --------------------------------------------------------
    2. SHORT KV URL

       ?k=<key>

       Retrieve the contract and serve SkyMedia.
    --------------------------------------------------------
    */

    if (key) {

      /*
      Validate the key format.
      */

      if (
        key.length !== KEY_LENGTH ||
        !/^[A-Fa-f0-9]{16}$/.test(key)
      ) {

        return new Response(
          "Invalid SkyMedia key.",
          {
            status: 400
          }
        );
      }


      const normalizedKey =
        key.toUpperCase();


      const payload =
        await env.MEDIA_KV.get(
          normalizedKey
        );


      if (!payload) {

        return new Response(
          "SkyMedia publication not found.",
          {
            status: 404,
            headers: {
              "content-type":
                "text/plain; charset=UTF-8"
            }
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
            status: 500
          }
        );
      }


      /*
      Serve index.html with the existing contractz value
      injected before the application starts.
      */

      return serveWithContract(
        request,
        env,
        payload
      );
    }


    /*
    --------------------------------------------------------
    3. OLD C2.2 URL

       ?contractz=sr2.<payload>

       Do NOT require KV.

       This preserves every existing SkyMedia link.
    --------------------------------------------------------
    */

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
            status: 400
          }
        );
      }


      /*
      Existing long URLs continue directly to the app.

      We do not automatically put them into KV here because
      there is no need to change their behavior.
      */

      return serveWithContract(
        request,
        env,
        suppliedPayload
      );
    }


    /*
    --------------------------------------------------------
    4. NORMAL STATIC SITE REQUEST

       No contract and no KV key.

       Let Cloudflare Assets serve the requested file.
    --------------------------------------------------------
    */

    return env.ASSETS.fetch(
      request
    );
  }

};
