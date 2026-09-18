"use strict";

/*
=========================================================
 SkyMedia Worker

 FINAL SHORT SHARE LINK ARCHITECTURE

 Public share URL:

     /s/<16-character-key>

 The selected item is already encoded as a ONE-ITEM
 SR2 contract before it reaches this Worker.

 Flow:

     ShareManager
          ↓
     POST /__sky_share_prime
          ↓
     Worker calculates deterministic key
          ↓
     MEDIA_KV stores SR2 payload
          ↓
     Worker returns /s/<key>
          ↓
     recipient opens /s/<key>
          ↓
     Worker retrieves payload
          ↓
     window.SkyMediaContract
     window.__SKY_SHARE_TARGET
          ↓
     existing GlideContract / Manifest
          ↓
     existing ShareManager
          ↓
     existing ShareViewer

 The browser address bar NEVER receives the long contract.
=========================================================
*/

const CONTRACT_PREFIX = "sr2.";
const KEY_LENGTH = 16;

const SKYMEDIA_BASE_URL =
  "https://skyreader-prototype.sliburd81.workers.dev";

/* =========================================================
   Open Graph / Social Preview
========================================================= */

const OG_SITE_NAME = "Meditation Mornings";

const OG_DEFAULT_THUMBNAIL =
  "https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/mKxnsa8ky8uPGbBKpTyv/pub/lu8ys9mg3bqa2jgeWIFB.webp";

const OG_LOGO =
  "https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/mKxnsa8ky8uPGbBKpTyv/pub/Qysgcds56u8OmAi76mCC.webp";

const OG_IMAGE_PATH =
  "/__sky_og_image";

const SHARE_PATH_PREFIX =
  "/s/";

/* =========================================================
   FNV-1A
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

  if (
    !payload.startsWith(
      CONTRACT_PREFIX
    )
  ) {
    return false;
  }

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

  } catch (error) {

    return null;
  }
}

/* =========================================================
   C2.2 decompressor
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

  if (
    version !== 2
  ) {

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
        (
          flags &
          (1 << bit)
        ) !== 0;

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
   Decode SR2
========================================================= */

function decodeContractPayload(payload) {

  if (
    !isValidPayload(
      payload
    )
  ) {

    throw new Error(
      "Invalid sr2 payload."
    );
  }

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
   Contract normalization
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
   Item selection

   The final share contract contains ONE item, so there is
   no need for section/id query parameters.

   We still accept id when processing legacy links.
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

    const match =
      items.find(
        item =>
          String(
            item?.id ?? ""
          ).trim() ===
          requestedId
      );

    if (match) {
      return match;
    }
  }

  return items[0];
}

/* =========================================================
   Type → Share Section
========================================================= */

function normalizeSection(
  section
) {

  const value =
    String(
      section || ""
    )
      .trim()
      .toLowerCase();

  if (
    value === "book" ||
    value === "books" ||
    value === "reader" ||
    value === "pdf" ||
    value === "pdfs"
  ) {

    return "reader";
  }

  if (
    value === "video" ||
    value === "videos"
  ) {

    return "video";
  }

  if (
    value === "slideshow" ||
    value === "slideshows" ||
    value === "slide" ||
    value === "slides"
  ) {

    return "slideshow";
  }

  return value;
}

function sectionFromItem(
  item
) {

  const type =
    String(
      item?.type || ""
    )
      .trim()
      .toLowerCase();

  if (type === "book") {
    return "reader";
  }

  if (type === "video") {
    return "video";
  }

  if (type === "slideshow") {
    return "slideshow";
  }

  return normalizeSection(type);
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
    String(value)
      .trim();

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
   Open Graph
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
    new URL(
      request.url
    );

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
   Bootstrap

   CRITICAL:

   Do NOT rewrite the browser URL.

   The address bar must remain:

       /s/<key>

   The contract is supplied directly to the existing
   GlideContract adapter through its accepted global:

       window.SkyMediaContract
========================================================= */

function injectContractBootstrap(
  html,
  payload,
  request,
  key
) {

  let contract = null;
  let item = null;

  try {

    contract =
      decodeContractPayload(
        payload
      );

    item =
      getSharedItem(
        contract,
        new URL(request.url)
      );

  } catch (error) {

    console.error(
      "SkyMedia share bootstrap decode failed:",
      error
    );
  }

  const section =
    sectionFromItem(item);

  const id =
    String(
      item?.id || ""
    ).trim();

  const encodedPayload =
    JSON.stringify(
      payload
    );

  const target =
    JSON.stringify({
      section,
      id
    });

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

  window.SkyMediaContract =
    ${encodedPayload};

  window.__SKY_SHARE_TARGET =
    ${target};

  window.__SKY_SHARE_KEY =
    ${JSON.stringify(key)};

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
   OG IMAGE
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
        format: "image/webp",
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
   Share Prime

   Client sends ONLY:

       {
         contractz,
         section,
         id
       }

   Worker calculates the key.

   section/id are retained only as diagnostic compatibility
   fields. They are NOT part of the public URL.
========================================================= */

async function handleSharePrime(
  request,
  env
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
        headers: corsHeaders
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
        headers: corsHeaders
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
        headers: corsHeaders
      }
    );
  }

  const payload =
    String(
      body?.contractz ||
      ""
    ).trim();

  if (
    !isValidPayload(
      payload
    )
  ) {

    return new Response(
      JSON.stringify({
        error:
          "Invalid share contract."
      }),
      {
        status: 400,
        headers: corsHeaders
      }
    );
  }

  const key =
    makeKey(
      payload
    );

  try {

    await env.MEDIA_KV.put(
      key,
      payload
    );

    const stored =
      await env.MEDIA_KV.get(
        key
      );

    if (
      stored !==
      payload
    ) {

      throw new Error(
        "KV verification failed."
      );
    }

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
        headers: corsHeaders
      }
    );
  }

  const shareUrl =
    SKYMEDIA_BASE_URL +
    SHARE_PATH_PREFIX +
    key;

  return new Response(
    JSON.stringify({
      url: shareUrl,
      key
    }),
    {
      status: 200,
      headers: corsHeaders
    }
  );
}

/* =========================================================
   Legacy ?k=<key>&contractz=<payload>
========================================================= */

async function handleLegacyPrime(
  request,
  env,
  keyParam,
  contractz
) {

  const key =
    String(
      keyParam || ""
    )
      .trim()
      .toUpperCase();

  if (
    !isValidKey(key) ||
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

  if (
    makeKey(contractz) !==
    key
  ) {

    return new Response(
      "SkyMedia publication link is invalid.",
      {
        status: 400,
        headers: textHeaders()
      }
    );
  }

  try {

    await env.MEDIA_KV.put(
      key,
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

  const cleanUrl =
    new URL(
      request.url
    );

  cleanUrl.searchParams.delete(
    "contractz"
  );

  cleanUrl.searchParams.delete(
    "section"
  );

  cleanUrl.searchParams.delete(
    "id"
  );

  cleanUrl.searchParams.delete(
    "k"
  );

  cleanUrl.pathname =
    SHARE_PATH_PREFIX +
    key;

  return Response.redirect(
    cleanUrl.toString(),
    302
  );
}

/* =========================================================
   /s/<key>
========================================================= */

async function handleShortShare(
  request,
  env
) {

  const url =
    new URL(
      request.url
    );

  const prefix =
    SHARE_PATH_PREFIX;

  if (
    !url.pathname.startsWith(
      prefix
    )
  ) {

    return null;
  }

  const key =
    url.pathname
      .slice(
        prefix.length
      )
      .split("/")[0]
      .trim()
      .toUpperCase();

  if (
    !isValidKey(key)
  ) {

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
        key
      );

  } catch (error) {

    console.error(
      "SkyMedia short-link KV read failed:",
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
    payload,
    key
  );
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
      new URL(
        request.url
      );

    /* -----------------------------------------------------
       OG image
    ----------------------------------------------------- */

    if (
      url.pathname ===
      OG_IMAGE_PATH
    ) {

      return serveOgImage(
        request,
        env
      );
    }

    /* -----------------------------------------------------
       Share prime
    ----------------------------------------------------- */

    if (
      url.pathname ===
      "/__sky_share_prime"
    ) {

      return handleSharePrime(
        request,
        env
      );
    }

    /* -----------------------------------------------------
       Canonical /s/<key>
    ----------------------------------------------------- */

    if (
      url.pathname.startsWith(
        SHARE_PATH_PREFIX
      )
    ) {

      return handleShortShare(
        request,
        env
      );
    }

    const keyParam =
      url.searchParams.get(
        "k"
      );

    const contractz =
      url.searchParams.get(
        "contractz"
      );

    /* -----------------------------------------------------
       Legacy ?k=<key>&contractz=<payload>
    ----------------------------------------------------- */

    if (
      keyParam &&
      contractz
    ) {

      return handleLegacyPrime(
        request,
        env,
        keyParam,
        contractz
      );
    }

    /* -----------------------------------------------------
       Legacy ?k=<key>
    ----------------------------------------------------- */

    if (keyParam) {

      const key =
        keyParam
          .trim()
          .toUpperCase();

      if (
        !isValidKey(key)
      ) {

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
            key
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

      return serveWithContract(
        request,
        env,
        payload,
        key
      );
    }

    /* -----------------------------------------------------
       Legacy direct contract
    ----------------------------------------------------- */

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
            headers: textHeaders()
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

    /* -----------------------------------------------------
       Normal application
    ----------------------------------------------------- */

    return env.ASSETS.fetch(
      request
    );
  }
};