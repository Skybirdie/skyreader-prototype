"use strict";

const CONTRACT_PREFIX = "sr2.";
const COMPACT_CONTRACT_PREFIX = "sr2c.";

const KEY_LENGTH = 16;

const SKYMEDIA_BASE_URL =
  "https://skyreader-prototype.sliburd81.workers.dev";

/* =========================================================
   Open Graph / Social Preview configuration
   ========================================================= */

const OG_SITE_NAME = "Meditation Mornings";

const OG_DEFAULT_THUMBNAIL =
  "https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/mKxnsa8ky8uPGbBKpTyv/pub/lu8ys9mg3bqa2jgeWIFB.webp";

const OG_LOGO =
  "https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/mKxnsa8ky8uPGbBKpTyv/pub/Qysgcds56u8OmAi76mCC.webp";

const OG_IMAGE_PATH = "/__sky_og_image";


/* =========================================================
   Deterministic KV key generation
   ========================================================= */

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

  if (!payload) {
    return false;
  }

  const isStandard =
    payload.startsWith(
      CONTRACT_PREFIX
    );

  const isCompact =
    payload.startsWith(
      COMPACT_CONTRACT_PREFIX
    );

  if (!isStandard && !isCompact) {
    return false;
  }

  const prefix =
    isCompact
      ? COMPACT_CONTRACT_PREFIX
      : CONTRACT_PREFIX;

  const encoded =
    payload.slice(
      prefix.length
    );

  if (!encoded) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(
    encoded
  );
}


/* =========================================================
   Response helpers
   ========================================================= */

function htmlHeaders() {

  return {
    "content-type":
      "text/html; charset=UTF-8",

    "cache-control":
      "no-store, no-cache, must-revalidate",

    "pragma":
      "no-cache"
  };
}


function textHeaders() {

  return {
    "content-type":
      "text/plain; charset=UTF-8",

    "cache-control":
      "no-store, no-cache, must-revalidate",

    "pragma":
      "no-cache"
  };
}


/* =========================================================
   Asset request
   ========================================================= */

function makeCleanAssetRequest(request) {

  const assetUrl =
    new URL(
      "/index.html",
      request.url
    );

  return new Request(
    assetUrl.toString(),
    {
      method: "GET",
      headers: request.headers
    }
  );
}


/* =========================================================
   C2.2 Base64URL decoder
   ========================================================= */

function base64UrlDecode(value) {

  try {

    let base64 =
      value
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (
      base64.length % 4
    ) {
      base64 += "=";
    }

    const binary =
      atob(base64);

    const bytes =
      new Uint8Array(
        binary.length
      );

    for (
      let i = 0;
      i < binary.length;
      i++
    ) {

      bytes[i] =
        binary.charCodeAt(i);
    }

    return bytes;

  } catch (_) {

    return null;
  }
}


/* =========================================================
   C2.2 byte decompressor
   ========================================================= */

function decompressBytes(bytes) {

  if (
    !bytes ||
    bytes.length < 2
  ) {
    throw new Error(
      "C2.2 payload is too short."
    );
  }

  const version =
    bytes[0];

  if (version !== 2) {
    throw new Error(
      "Unsupported C2.2 codec version: " +
      version
    );
  }

  const windowSize = 4095;
  const maxLen = 18;
  const minLen = 3;

  const output = [];

  let pos = 1;

  while (
    pos < bytes.length
  ) {

    const flags =
      bytes[pos++];

    for (
      let bit = 0;
      bit < 8 &&
      pos < bytes.length;
      bit++
    ) {

      const isMatch =
        (flags &
          (1 << bit)) !==
        0;


      if (!isMatch) {

        output.push(
          bytes[pos++]
        );

        continue;
      }


      if (
        pos + 1 >=
        bytes.length
      ) {
        throw new Error(
          "Incomplete C2.2 match token."
        );
      }


      const high =
        bytes[pos++];

      const low =
        bytes[pos++];

      const packed =
        (high << 8) |
        low;


      const length =
        (packed & 0x0F) +
        minLen;

      const offset =
        (packed >>> 4) +
        1;


      if (
        length < minLen ||
        length > maxLen
      ) {
        throw new Error(
          "Invalid C2.2 match length."
        );
      }


      if (
        offset < 1 ||
        offset > windowSize ||
        offset > output.length
      ) {
        throw new Error(
          "Invalid C2.2 match offset."
        );
      }


      for (
        let i = 0;
        i < length;
        i++
      ) {

        const sourceIndex =
          output.length -
          offset;

        output.push(
          output[sourceIndex]
        );
      }
    }
  }

  return new Uint8Array(
    output
  );
}


/* =========================================================
   Decode standard sr2 payload
   ========================================================= */

function decodeStandardPayload(
  payload
) {

  const encoded =
    payload.slice(
      CONTRACT_PREFIX.length
    );

  const compressed =
    base64UrlDecode(
      encoded
    );

  if (!compressed) {
    throw new Error(
      "Unable to Base64URL-decode sr2 payload."
    );
  }

  const utf8 =
    decompressBytes(
      compressed
    );

  const json =
    new TextDecoder()
      .decode(utf8);

  return JSON.parse(json);
}


/* =========================================================
   Expand compact sr2c item
   ========================================================= */

function expandCompactItem(compact) {

  if (
    !compact ||
    typeof compact !== "object" ||
    Array.isArray(compact)
  ) {
    throw new Error(
      "Invalid compact SkyMedia item."
    );
  }

  const item = {};

  if ("i" in compact) {
    item.id = compact.i;
  }

  if ("t" in compact) {
    item.type = compact.t;
  }

  if ("T" in compact) {
    item.title = compact.T;
  }

  if ("s" in compact) {
    item.subtitle = compact.s;
  }

  if ("n" in compact) {
    item.thumbnail = compact.n;
  }

  if ("m" in compact) {
    item.media = compact.m;
  }

  if ("a" in compact) {
    item.audio = compact.a;
  }

  if ("u" in compact) {
    item.author = compact.u;
  }

  if ("c" in compact) {
    item.category = compact.c;
  }

  if ("d" in compact) {
    item.date = compact.d;
  }

  return item;
}


/* =========================================================
   Decode compact sr2c payload
   ========================================================= */

function decodeCompactPayload(
  payload
) {

  const encoded =
    payload.slice(
      COMPACT_CONTRACT_PREFIX.length
    );

  const compressed =
    base64UrlDecode(
      encoded
    );

  if (!compressed) {
    throw new Error(
      "Unable to Base64URL-decode sr2c payload."
    );
  }

  const utf8 =
    decompressBytes(
      compressed
    );

  const json =
    new TextDecoder()
      .decode(utf8);

  const compact =
    JSON.parse(json);

  const item =
    expandCompactItem(
      compact
    );

  return [item];
}


/* =========================================================
   Decode either standard sr2 or compact sr2c
   ========================================================= */

function decodeContractPayload(
  payload
) {

  if (
    !isValidPayload(
      payload
    )
  ) {
    throw new Error(
      "Invalid SkyMedia payload."
    );
  }

  if (
    payload.startsWith(
      COMPACT_CONTRACT_PREFIX
    )
  ) {
    return decodeCompactPayload(
      payload
    );
  }

  return decodeStandardPayload(
    payload
  );
}


/* =========================================================
   Normalize contract to array
   ========================================================= */

function normalizeContractArray(
  contract
) {

  if (
    Array.isArray(contract)
  ) {
    return contract;
  }

  if (
    contract &&
    typeof contract === "object"
  ) {
    return [contract];
  }

  return [];
}


/* =========================================================
   Select shared item
   ========================================================= */

function getSharedItem(
  contract,
  url
) {

  const items =
    normalizeContractArray(
      contract
    );

  if (!items.length) {
    return null;
  }

  const requestedId =
    String(
      url.searchParams.get(
        "id"
      ) || ""
    ).trim();


  if (requestedId) {

    const matchingItem =
      items.find(
        item =>
          String(
            item?.id ?? ""
          ).trim() ===
          requestedId
      );

    if (matchingItem) {
      return matchingItem;
    }
  }


  return items[0];
}


/* =========================================================
   Extract /share route information
   ========================================================= */

function getShareRoute(url) {

  const parts =
    url.pathname
      .split("/")
      .filter(Boolean);

  if (
    parts.length < 2 ||
    parts[0].toLowerCase() !==
      "share"
  ) {
    return null;
  }

  return {
    key:
      decodeURIComponent(
        parts[1] || ""
      ).trim().toUpperCase(),

    section:
      parts[2]
        ? decodeURIComponent(parts[2])
        : "",

    id:
      parts[3]
        ? decodeURIComponent(parts[3])
        : ""
  };
}


/* =========================================================
   Clean media URL
   ========================================================= */

function cleanMediaUrl(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  let text =
    String(value).trim();

  if (!text) {
    return "";
  }


  if (
    text.length >= 2 &&
    text.startsWith('"') &&
    text.endsWith('"')
  ) {

    try {

      const decoded =
        JSON.parse(text);

      if (
        typeof decoded ===
        "string"
      ) {
        text =
          decoded.trim();
      }

    } catch (_) {

      text =
        text
          .slice(1, -1)
          .trim();
    }
  }


  const markdownMatch =
    text.match(
      /^\s*\[[^\]]+\]\((https?:\/\/[^)]+)\)\s*$/i
    );

  if (markdownMatch) {
    return markdownMatch[1];
  }


  const urlMatch =
    text.match(
      /https?:\/\/[^\s<>"')]+/i
    );

  if (urlMatch) {
    return urlMatch[0];
  }

  return "";
}


/* =========================================================
   HTML escaping
   ========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#39;"
    );
}


/* =========================================================
   Build Open Graph metadata
   ========================================================= */

function buildOgTags(
  request,
  key,
  payload
) {

  let contract = null;

  try {

    contract =
      decodeContractPayload(
        payload
      );

  } catch (error) {

    console.error(
      "SkyMedia OG contract decode failed:",
      error
    );

    return "";
  }


  const url =
    new URL(request.url);

  const shareRoute =
    getShareRoute(url);

  const item =
    getSharedItem(
      contract,
      url
    );


  const title =
    String(
      item?.title ||
      OG_SITE_NAME
    ).trim();


  const imageUrl =
    new URL(
      OG_IMAGE_PATH,
      url.origin
    );

  imageUrl.searchParams.set(
    "k",
    key
  );


  if (
    shareRoute?.id
  ) {
    imageUrl.searchParams.set(
      "id",
      shareRoute.id
    );
  } else {

    const requestedId =
      String(
        url.searchParams.get(
          "id"
        ) || ""
      ).trim();

    if (requestedId) {
      imageUrl.searchParams.set(
        "id",
        requestedId
      );
    }
  }


  const escapedTitle =
    escapeHtml(title);

  const escapedSiteName =
    escapeHtml(
      OG_SITE_NAME
    );

  const escapedImageUrl =
    escapeHtml(
      imageUrl.toString()
    );

  const escapedPageUrl =
    escapeHtml(
      url.toString()
    );


  let tags = "";


  tags +=
    `<meta property="og:title" content="${escapedTitle}">`;

  tags +=
    `<meta property="og:site_name" content="${escapedSiteName}">`;

  tags +=
    `<meta property="og:url" content="${escapedPageUrl}">`;

  tags +=
    `<meta property="og:image" content="${escapedImageUrl}">`;

  tags +=
    `<meta property="og:image:width" content="1200">`;

  tags +=
    `<meta property="og:image:height" content="630">`;


  return tags;
}


/* =========================================================
   Inject recovered contract and OG metadata
   ========================================================= */

function injectContractBootstrap(
  html,
  payload,
  request,
  key
) {

  const encodedPayload =
    JSON.stringify(
      payload
    );


  const ogTags =
    key
      ? buildOgTags(
          request,
          key,
          payload
        )
      : "";


  const script = `
<script>
(function () {
  "use strict";

  var payload = ${encodedPayload};

  if (!payload) return;

  try {

    var url =
      new URL(
        window.location.href
      );

    /*
     * Remove only the transient payload/key parameters.
     *
     * The clean /share/... path remains visible.
     */

    url.searchParams.delete("contractz");
    url.searchParams.delete("k");

    /*
     * The application still receives the normal contractz
     * parameter internally.
     */

    url.searchParams.set(
      "contractz",
      payload
    );

    /*
     * Do not expose the long contract in the address bar.
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
      "SkyMedia share bootstrap failed:",
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
    return html;
  }


  return (
    html.slice(
      0,
      index
    ) +
    ogTags +
    script +
    html.slice(index)
  );
}


/* =========================================================
   Serve index.html with recovered contract
   ========================================================= */

async function serveWithContract(
  request,
  env,
  payload,
  key = ""
) {

  const assetResponse =
    await env.ASSETS.fetch(
      makeCleanAssetRequest(
        request
      )
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
      payload,
      request,
      key
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
   Generate social-preview image
   ========================================================= */

async function serveOgImage(
  request,
  env
) {

  if (!env.IMAGES) {

    return new Response(
      "SkyMedia Images binding is not configured.",
      {
        status: 500,
        headers: textHeaders()
      }
    );
  }


  const url =
    new URL(request.url);


  const key =
    String(
      url.searchParams.get(
        "k"
      ) || ""
    )
      .trim()
      .toUpperCase();


  if (!isValidKey(key)) {

    return new Response(
      "Invalid SkyMedia publication key.",
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
        key
      );

  } catch (error) {

    console.error(
      "SkyMedia OG KV read failed:",
      error
    );

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


  let contract;


  try {

    contract =
      decodeContractPayload(
        payload
      );

  } catch (error) {

    console.error(
      "SkyMedia OG C2.2 decode failed:",
      error
    );

    return new Response(
      "SkyMedia publication data could not be decoded.",
      {
        status: 500,
        headers: textHeaders()
      }
    );
  }


  const item =
    getSharedItem(
      contract,
      url
    );


  let thumbnailUrl =
    cleanMediaUrl(
      item?.thumbnail
    );


  if (!thumbnailUrl) {
    thumbnailUrl =
      OG_DEFAULT_THUMBNAIL;
  }


  let baseResponse =
    await fetch(
      thumbnailUrl
    );


  if (
    !baseResponse.ok ||
    !baseResponse.body
  ) {

    if (
      thumbnailUrl !==
      OG_DEFAULT_THUMBNAIL
    ) {

      baseResponse =
        await fetch(
          OG_DEFAULT_THUMBNAIL
        );
    }
  }


  if (
    !baseResponse.ok ||
    !baseResponse.body
  ) {

    return new Response(
      "SkyMedia OG thumbnail could not be loaded.",
      {
        status: 502,
        headers: textHeaders()
      }
    );
  }


  const logoResponse =
    await fetch(
      OG_LOGO
    );


  if (
    !logoResponse.ok ||
    !logoResponse.body
  ) {

    return new Response(
      "SkyMedia OG logo could not be loaded.",
      {
        status: 502,
        headers: textHeaders()
      }
    );
  }


  const baseStreams =
    baseResponse.body.tee();


  let imageInfo = null;


  try {

    imageInfo =
      await env.IMAGES.info(
        baseStreams[0]
      );

  } catch (error) {

    console.error(
      "SkyMedia OG image info failed:",
      error
    );
  }


  let logoWidth = 160;


  if (
    imageInfo &&
    Number.isFinite(
      Number(
        imageInfo.width
      )
    )
  ) {

    logoWidth =
      Math.round(
        Number(
          imageInfo.width
        ) * 0.16
      );

    logoWidth =
      Math.max(
        80,
        Math.min(
          240,
          logoWidth
        )
      );
  }


  let imagePipeline =
    env.IMAGES.input(
      baseStreams[1]
    );


  imagePipeline =
    imagePipeline.draw(
      env.IMAGES
        .input(
          logoResponse.body
        )
        .transform({
          width: logoWidth,
          fit: "contain"
        }),
      {
        bottom: 18,
        right: 18,
        opacity: 0.88
      }
    );


  const result =
    await imagePipeline.output(
      {
        format:
          "image/webp",
        quality: 85
      }
    );


  return result.response(
    {
      headers: {
        "Cache-Control":
          "public, max-age=86400, stale-while-revalidate=604800"
      }
    }
  );
}


/* =========================================================
   Store a first-use payload in KV
   ========================================================= */

async function storeSharePayload(
  env,
  key,
  payload
) {

  if (
    !isValidKey(key) ||
    !isValidPayload(payload)
  ) {
    throw new Error(
      "Invalid share payload."
    );
  }


  if (
    makeKey(payload) !== key
  ) {
    throw new Error(
      "Share payload key mismatch."
    );
  }


  await env.MEDIA_KV.put(
    key,
    payload
  );


  const stored =
    await env.MEDIA_KV.get(
      key
    );


  if (stored !== payload) {
    throw new Error(
      "KV verification failed."
    );
  }
}


/* =========================================================
   Worker
   ========================================================= */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    const url =
      new URL(request.url);


    const keyParam =
      url.searchParams.get(
        "k"
      );


    const contractz =
      url.searchParams.get(
        "contractz"
      );


    /* =====================================================
       SOCIAL PREVIEW IMAGE
       ===================================================== */

    if (
      url.pathname ===
      OG_IMAGE_PATH
    ) {

      return serveOgImage(
        request,
        env
      );
    }


    /* =====================================================
       NEW /share/... ROUTE
       ===================================================== */

    const shareRoute =
      getShareRoute(url);


    if (shareRoute) {

      const shareKey =
        shareRoute.key;


      if (!isValidKey(shareKey)) {

        return new Response(
          "SkyMedia share link is invalid.",
          {
            status: 400,
            headers:
              textHeaders()
          }
        );
      }


      /*
       * First use:
       *
       * /share/key/section/id?contractz=...
       *
       * Store the contract, then redirect to the exact
       * same path without the long contract.
       */

      if (contractz) {

        if (
          !isValidPayload(
            contractz
          )
        ) {

          return new Response(
            "SkyMedia share payload is invalid.",
            {
              status: 400,
              headers:
                textHeaders()
            }
          );
        }


        if (
          makeKey(
            contractz
          ) !==
          shareKey
        ) {

          return new Response(
            "SkyMedia share payload is invalid.",
            {
              status: 400,
              headers:
                textHeaders()
            }
          );
        }


        try {

          await storeSharePayload(
            env,
            shareKey,
            contractz
          );

        } catch (error) {

          console.error(
            "SkyMedia /share KV write failed:",
            error
          );

          return new Response(
            "SkyMedia KV write failed.",
            {
              status: 500,
              headers:
                textHeaders()
            }
          );
        }


        /*
         * Remove contractz AND any legacy query key.
         */

        const cleanUrl =
          new URL(
            request.url
          );

        cleanUrl.searchParams.delete(
          "contractz"
        );

        cleanUrl.searchParams.delete(
          "k"
        );


        /*
         * This is the clean public URL.
         */

        return Response.redirect(
          cleanUrl.toString(),
          302
        );
      }


      /*
       * Normal clean /share/... request.
       *
       * Retrieve payload from KV.
       */

      let payload = null;


      try {

        payload =
          await env.MEDIA_KV.get(
            shareKey
          );

      } catch (error) {

        console.error(
          "SkyMedia /share KV read failed:",
          error
        );

        return new Response(
          "SkyMedia KV read failed.",
          {
            status: 500,
            headers:
              textHeaders()
          }
        );
      }


      if (!payload) {

        return new Response(
          "SkyMedia publication not found.",
          {
            status: 404,
            headers:
              textHeaders()
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
            headers:
              textHeaders()
          }
        );
      }


      /*
       * Put section/id into query parameters internally so
       * the existing SkyMedia application continues to see
       * the same navigation information it already expects.
       */

      const internalRequestUrl =
        new URL(
          request.url
        );


      internalRequestUrl.searchParams.set(
        "k",
        shareKey
      );


      if (shareRoute.section) {

        internalRequestUrl.searchParams.set(
          "section",
          shareRoute.section
        );
      }


      if (shareRoute.id) {

        internalRequestUrl.searchParams.set(
          "id",
          shareRoute.id
        );
      }


      const internalRequest =
        new Request(
          internalRequestUrl.toString(),
          request
        );


      return serveWithContract(
        internalRequest,
        env,
        payload,
        shareKey
      );
    }


    /* =====================================================
       SHARE PRIME ENDPOINT
       ===================================================== */

    if (
      url.pathname ===
      "/__sky_share_prime"
    ) {

      const corsHeaders = {

        "access-control-allow-origin":
          "*",

        "access-control-allow-methods":
          "POST, OPTIONS",

        "access-control-allow-headers":
          "Content-Type",

        "content-type":
          "application/json; charset=UTF-8",

        "cache-control":
          "no-store, no-cache, must-revalidate"
      };


      if (
        request.method ===
        "OPTIONS"
      ) {

        return new Response(
          null,
          {
            status: 204,
            headers:
              corsHeaders
          }
        );
      }


      if (
        request.method !==
        "POST"
      ) {

        return new Response(
          JSON.stringify({
            error:
              "Share-prime requires POST."
          }),
          {
            status: 405,
            headers:
              corsHeaders
          }
        );
      }


      let body;


      try {

        body =
          await request.json();

      } catch (_) {

        return new Response(
          JSON.stringify({
            error:
              "Invalid share-prime JSON."
          }),
          {
            status: 400,
            headers:
              corsHeaders
          }
        );
      }


      const primeKey =
        String(
          body?.k || ""
        )
          .trim()
          .toUpperCase();


      const primeContract =
        String(
          body?.contractz ||
          ""
        );


      const primeSection =
        String(
          body?.section ||
          ""
        ).trim();


      const primeId =
        String(
          body?.id ||
          ""
        ).trim();


      if (
        !isValidKey(
          primeKey
        ) ||
        !isValidPayload(
          primeContract
        )
      ) {

        return new Response(
          JSON.stringify({
            error:
              "Invalid share-prime data."
          }),
          {
            status: 400,
            headers:
              corsHeaders
          }
        );
      }


      if (
        makeKey(
          primeContract
        ) !== primeKey
      ) {

        return new Response(
          JSON.stringify({
            error:
              "Share-prime key mismatch."
          }),
          {
            status: 400,
            headers:
              corsHeaders
          }
        );
      }


      try {

        await storeSharePayload(
          env,
          primeKey,
          primeContract
        );

      } catch (error) {

        console.error(
          "SkyMedia share-prime KV failure:",
          error
        );

        return new Response(
          JSON.stringify({
            error:
              "SkyMedia KV write failed."
          }),
          {
            status: 500,
            headers:
              corsHeaders
          }
        );
      }


      const cleanUrl =
        new URL(
          SKYMEDIA_BASE_URL
        );


      cleanUrl.pathname =
        "/share/" +
        encodeURIComponent(
          primeKey
        );


      if (primeSection) {

        cleanUrl.pathname +=
          "/" +
          encodeURIComponent(
            primeSection
          );
      }


      if (primeId) {

        cleanUrl.pathname +=
          "/" +
          encodeURIComponent(
            primeId
          );
      }


      return new Response(
        JSON.stringify({
          url:
            cleanUrl.toString()
        }),
        {
          status: 200,
          headers:
            corsHeaders
        }
      );
    }


    /* =====================================================
       LEGACY ?k=<key>&contractz=<payload>
       ===================================================== */

    if (
      keyParam &&
      contractz
    ) {

      const normalizedKey =
        keyParam
          .trim()
          .toUpperCase();


      if (
        !isValidKey(
          normalizedKey
        ) ||
        !isValidPayload(
          contractz
        )
      ) {

        return new Response(
          "SkyMedia publication link is invalid.",
          {
            status: 400,
            headers:
              textHeaders()
          }
        );
      }


      if (
        makeKey(
          contractz
        ) !==
        normalizedKey
      ) {

        return new Response(
          "SkyMedia publication link is invalid.",
          {
            status: 400,
            headers:
              textHeaders()
          }
        );
      }


      try {

        await storeSharePayload(
          env,
          normalizedKey,
          contractz
        );

      } catch (error) {

        return new Response(
          "SkyMedia KV write failed.",
          {
            status: 500,
            headers:
              textHeaders()
          }
        );
      }


      const cleanUrl =
        new URL(
          request.url
        );


      cleanUrl.searchParams.delete(
        "contractz"
      );


      return Response.redirect(
        cleanUrl.toString(),
        302
      );
    }


    /* =====================================================
       LEGACY CLEAN ?k=<key>
       ===================================================== */

    if (keyParam) {

      const normalizedKey =
        keyParam
          .trim()
          .toUpperCase();


      if (
        !isValidKey(
          normalizedKey
        )
      ) {

        return new Response(
          "SkyMedia publication key is invalid.",
          {
            status: 400,
            headers:
              textHeaders()
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
            headers:
              textHeaders()
          }
        );
      }


      if (!payload) {

        return new Response(
          "SkyMedia publication not found.",
          {
            status: 404,
            headers:
              textHeaders()
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
            headers:
              textHeaders()
          }
        );
      }


      return serveWithContract(
        request,
        env,
        payload,
        normalizedKey
      );
    }


    /* =====================================================
       LEGACY DIRECT CONTRACT
       ===================================================== */

    if (contractz) {

      if (
        !isValidPayload(
          contractz
        )
      ) {

        return new Response(
          "SkyMedia contract is invalid.",
          {
            status: 400,
            headers:
              textHeaders()
          }
        );
      }


      const contractKey =
        makeKey(
          contractz
        );


      return serveWithContract(
        request,
        env,
        contractz,
        contractKey
      );
    }


    /* =====================================================
       NORMAL APPLICATION REQUEST
       ===================================================== */

    return env.ASSETS.fetch(
      request
    );
  }
};