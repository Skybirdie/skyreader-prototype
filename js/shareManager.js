"use strict";

/*

## SkyMedia Share Manager

PURPOSE

1. Create a short Share Mode URL containing ONLY:
   /s/<section>/<id>

2. Preserve compatibility with:
   ?contractz=<payload>&section=<section>&id=<id>
   ?k=<key>
   /s/<16-character-KV-key>

3. On a direct-ID share URL, locate the selected item
   using the existing SkyMedia Manifest machinery.

4. Hand the item to the EXISTING ShareViewer.

IMPORTANT

* Direct-ID links do NOT use Cloudflare KV.
* Direct-ID links do NOT contain the item contract.
* This does NOT create a catalog.
* This does NOT rebuild ShareViewer.
* This does NOT fall back to the normal Front Page viewer.
  =========================================================
  */

window.ShareManager = (function () {

const SHARE_PREFIX = "/s/";

const CONTRACT_PARAM = "contractz";
const SECTION_PARAM = "section";
const ID_PARAM = "id";

/* =====================================================
SECTION NORMALIZATION
===================================================== */

function normalizeSection(section) {


const value =
  String(section || "")
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

/* =====================================================
STRING CLEANUP
===================================================== */

function cleanString(value) {


if (
  value === null ||
  value === undefined
) {

  return "";
}


return String(value).trim();


}

/* =====================================================
MEDIA NORMALIZATION
===================================================== */

function normalizeMedia(media) {


if (Array.isArray(media)) {

  return media
    .map(cleanString)
    .filter(Boolean);
}


return cleanString(media);


}

/* =====================================================
BUILD MINIMAL AUTHORITATIVE ITEM


 Retained for backwards compatibility with the old
 contract-based sharing system.

 The NEW share URL does not use this data.


===================================================== */

function buildMinimalItem(item) {


if (
  !item ||
  typeof item !== "object"
) {

  return null;
}


const result = {

  id:
    cleanString(item.id),

  type:
    cleanString(item.type)
      .toLowerCase(),

  title:
    cleanString(item.title),

  subtitle:
    cleanString(item.subtitle),

  thumbnail:
    cleanString(item.thumbnail),

  media:
    normalizeMedia(item.media),

  audio:
    cleanString(item.audio),

  author:
    cleanString(item.author),

  category:
    cleanString(item.category),

  date:
    cleanString(item.date)
};


if (
  item.dateAdd !== undefined &&
  item.dateAdd !== null &&
  cleanString(item.dateAdd)
) {

  result.dateAdd =
    cleanString(item.dateAdd);
}


return result;


}

/* =====================================================
OLD CONTRACT ENCODER


 Retained so existing callers do not break.

 NEW share() DOES NOT use this.


===================================================== */

function encodeSelectedItem(item) {


if (
  !window.GlideContract ||
  !GlideContract.codec ||
  typeof GlideContract.codec.encode !== "function"
) {

  throw new Error(
    "GlideContract SR2 codec is not available."
  );
}


const minimalItem =
  buildMinimalItem(item);


if (
  !minimalItem ||
  !minimalItem.id
) {

  throw new Error(
    "Cannot create share link: selected item has no id."
  );
}


return GlideContract.codec.encode([
  minimalItem
]);


}

/* =====================================================
BASE URL


 The new share URL always starts from the Worker
 origin and does not inherit the current Glide
 contract/query string.


===================================================== */

function baseUrl() {


const url =
  new URL(
    window.location.href
  );


url.search = "";
url.hash = "";


return url;


}

/* =====================================================
BUILD NEW DIRECT-ID SHARE URL


 RESULT:

   /s/slideshow/itemid

   /s/reader/itemid

   /s/video/itemid


===================================================== */

function buildUrl(
section,
id,
item
) {


const normalizedSection =
  normalizeSection(section);


const normalizedId =
  cleanString(id);


if (!normalizedSection) {

  throw new Error(
    "Cannot create share link: section is missing."
  );
}


if (!normalizedId) {

  throw new Error(
    "Cannot create share link: item id is missing."
  );
}


const url =
  baseUrl();


/*
 * Remove ALL existing pathname content.

 * This is important because ShareManager may be
 * running inside the normal Glide/SkyMedia URL.
 */

url.pathname =
  SHARE_PREFIX +
  encodeURIComponent(
    normalizedSection
  ) +
  "/" +
  encodeURIComponent(
    normalizedId
  );


/*
 * The public share URL contains no:
   contractz
   section query parameter
   id query parameter
   KV key
*/

url.search = "";
url.hash = "";


return url.toString();


}

/* =====================================================
CLIPBOARD
===================================================== */

async function copyToClipboard(text) {


if (
  navigator.clipboard &&
  typeof navigator.clipboard.writeText === "function"
) {

  try {

    await navigator.clipboard.writeText(
      text
    );

    return true;

  } catch (error) {

    console.warn(
      "Clipboard API failed:",
      error
    );
  }
}


try {

  const textarea =
    document.createElement(
      "textarea"
    );


  textarea.value = text;

  textarea.setAttribute(
    "readonly",
    ""
  );

  textarea.style.position =
    "fixed";

  textarea.style.left =
    "-9999px";

  textarea.style.top =
    "0";


  document.body.appendChild(
    textarea
  );


  textarea.select();


  const copied =
    document.execCommand(
      "copy"
    );


  textarea.remove();


  return copied;

} catch (error) {

  console.warn(
    "Clipboard fallback failed:",
    error
  );


  return false;
}


}

/* =====================================================
SHARE


 NEW VERSION:
   Creates a direct /s/<section>/<id> URL.


===================================================== */

async function share(
section,
item
) {


if (
  !item ||
  typeof item !== "object"
) {

  throw new Error(
    "Cannot share: selected item is missing."
  );
}


const normalizedSection =
  normalizeSection(section);


if (!normalizedSection) {

  throw new Error(
    "Cannot share: section is missing."
  );
}


const normalizedId =
  cleanString(item.id);


if (!normalizedId) {

  throw new Error(
    "Cannot share: selected item has no id."
  );
}


/*
 * IMPORTANT:
 *
 * No contract encoding happens here.
 *
 * The public URL contains only the item's identity.
 */

const url =
  buildUrl(
    normalizedSection,
    normalizedId,
    item
  );


const title =
  cleanString(item.title) ||
  "SkyMedia";


/* ===================================================
   NATIVE DEVICE SHARE
=================================================== */

if (
  navigator.share &&
  typeof navigator.share === "function"
) {

  try {

    await navigator.share({

      title:
        title,

      text:
        title,

      url:
        url
    });


    return url;

  } catch (error) {

    /*
     * Continue to clipboard.
     *
     * This also handles users cancelling the
     * native share sheet.
     */

    console.warn(
      "Native share was not completed:",
      error
    );
  }
}


/* ===================================================
   CLIPBOARD
=================================================== */

const copied =
  await copyToClipboard(
    url
  );


if (copied) {

  try {

    alert(
      "Share link copied to clipboard."
    );

  } catch (error) {

    console.log(
      "Share link copied to clipboard."
    );
  }


  return url;
}


/* ===================================================
   LAST RESORT
=================================================== */

try {

  window.prompt(
    "Copy this share link:",
    url
  );

} catch (error) {

  console.log(
    "Share URL:",
    url
  );
}


return url;


}

/* =====================================================
PARSE DIRECT /s/<section>/<id> ROUTE
===================================================== */

function readPathTarget() {


const url =
  new URL(
    window.location.href
  );


const pathname =
  url.pathname;


if (
  !pathname.startsWith(
    SHARE_PREFIX
  )
) {

  return null;
}


const remainder =
  pathname.slice(
    SHARE_PREFIX.length
  );


if (!remainder) {

  return null;
}


const parts =
  remainder
    .split("/")
    .filter(Boolean);


/*
 * New format is exactly:

     /s/<section>/<id>
*/

if (
  parts.length !== 2
) {

  return null;
}


let section = "";
let id = "";


try {

  section =
    decodeURIComponent(
      parts[0]
    );


  id =
    decodeURIComponent(
      parts[1]
    );

} catch (_) {

  return null;
}


section =
  normalizeSection(
    section
  );


id =
  cleanString(
    id
  );


if (
  !section ||
  !id
) {

  return null;
}


return {

  section:
    section,

  id:
    id,

  contract:
    null,

  mode:
    "direct"
};


}

/* =====================================================
READ SHARE TARGET
===================================================== */

function readTarget() {


const url =
  new URL(
    window.location.href
  );


/*
 * -----------------------------------------------------
 * 1. New direct /s/<section>/<id> format
 * -----------------------------------------------------
 */

const pathTarget =
  readPathTarget();


if (pathTarget) {

  return pathTarget;
}


/*
 * -----------------------------------------------------
 * 2. Worker bootstrap target
 *
 * The Worker places this in the page before the
 * application starts.
 * -----------------------------------------------------
 */

if (
  window.__SKY_SHARE_TARGET &&
  typeof window.__SKY_SHARE_TARGET === "object"
) {

  const section =
    normalizeSection(
      window.__SKY_SHARE_TARGET.section
    );


  const id =
    cleanString(
      window.__SKY_SHARE_TARGET.id
    );


  if (
    section &&
    id
  ) {

    return {

      section:
        section,

      id:
        id,

      contract:
        window.__SKY_SHARE_PAYLOAD ||
        null,

      mode:
        window.__SKY_SHARE_PAYLOAD
          ? "contract"
          : "direct"
    };
  }
}


/*
 * -----------------------------------------------------
 * 3. Existing legacy query-string format
 * -----------------------------------------------------
 */

return {

  section:
    normalizeSection(
      url.searchParams.get(
        SECTION_PARAM
      )
    ),

  id:
    cleanString(
      url.searchParams.get(
        ID_PARAM
      )
    ),

  contract:
    url.searchParams.get(
      CONTRACT_PARAM
    ),

  mode:
    url.searchParams.get(
      CONTRACT_PARAM
    )
      ? "contract"
      : "query"
};


}

/* =====================================================
IS THIS A SHARE DEEP LINK?
===================================================== */

function isShareDeepLink() {


const target =
  readTarget();


return !!(
  target &&
  target.section &&
  target.id
);


}

/* =====================================================
SECTION -> MANIFEST TYPE
===================================================== */

function sectionType(section) {


const normalized =
  normalizeSection(
    section
  );


if (
  normalized === "reader"
) {

  return "book";
}


if (
  normalized === "video"
) {

  return "video";
}


if (
  normalized === "slideshow"
) {

  return "slideshow";
}


return normalized;


}

/* =====================================================
FIND ITEM IN EXISTING MANIFEST
===================================================== */

function findManifestItem(
target
) {


if (!window.Manifest) {

  return null;
}


const wantedId =
  cleanString(
    target.id
  );


if (!wantedId) {

  return null;
}


const type =
  sectionType(
    target.section
  );


/*
 * First use the type-specific Manifest collection.
 */

if (
  typeof Manifest.content === "function"
) {

  try {

    const items =
      Manifest.content(
        type
      );


    if (
      Array.isArray(items)
    ) {

      const match =
        items.find(
          function (item) {

            return (
              item &&
              cleanString(
                item.id
              ) ===
              wantedId
            );
          }
        );


      if (match) {

        return match;
      }
    }

  } catch (error) {

    console.warn(
      "[ShareManager] Manifest.content lookup failed:",
      error
    );
  }
}


/*
 * Fallback to Manifest.all().
 */

if (
  typeof Manifest.all === "function"
) {

  try {

    const items =
      Manifest.all();


    if (
      Array.isArray(items)
    ) {

      const match =
        items.find(
          function (item) {

            return (
              item &&
              cleanString(
                item.id
              ) ===
              wantedId
            );
          }
        );


      if (match) {

        return match;
      }
    }

  } catch (error) {

    console.warn(
      "[ShareManager] Manifest.all lookup failed:",
      error
    );
  }
}


return null;


}

/* =====================================================
WAIT FOR MANIFEST ITEM
===================================================== */

function waitForManifestItem(
target,
timeoutMs = 10000
) {


return new Promise(
  function (resolve) {

    const startedAt =
      Date.now();


    function check() {

      const item =
        findManifestItem(
          target
        );


      if (item) {

        resolve(item);

        return;
      }


      if (
        Date.now() -
        startedAt >=
        timeoutMs
      ) {

        resolve(null);

        return;
      }


      window.setTimeout(
        check,
        50
      );
    }


    check();
  }
);


}

/* =====================================================
WAIT FOR SHAREVIEWER
===================================================== */

function waitForShareViewer(
timeoutMs = 10000
) {


return new Promise(
  function (resolve) {

    const startedAt =
      Date.now();


    function check() {

      if (
        window.ShareViewer &&
        typeof ShareViewer.start ===
          "function"
      ) {

        resolve(true);

        return;
      }


      if (
        Date.now() -
        startedAt >=
        timeoutMs
      ) {

        resolve(false);

        return;
      }


      window.setTimeout(
        check,
        50
      );
    }


    check();
  }
);


}

/* =====================================================
START SHARE MODE
===================================================== */

async function startShareMode(
item,
target
) {


const available =
  await waitForShareViewer(
    10000
  );


if (!available) {

  console.error(
    "[ShareManager] ShareViewer.start() " +
    "did not become available."
  );


  return false;
}


try {

  await ShareViewer.start(
    item,
    {
      section:
        target.section,

      id:
        target.id
    }
  );


  return true;

} catch (error) {

  console.error(
    "[ShareManager] ShareViewer.start() failed:",
    error
  );


  return false;
}


}

/* =====================================================
OPEN DEEP LINK


 Works for both:

   /s/<section>/<id>

 and the existing contract-based share URL.


===================================================== */

async function openDeepLink() {


const target =
  readTarget();


/*
 * No section + ID means this is ordinary SkyMedia
 * navigation.
 */

if (
  !target ||
  !target.section ||
  !target.id
) {

  return false;
}


/*
 * Prevent multiple simultaneous attempts.
 */

if (
  openDeepLink._promise
) {

  return openDeepLink._promise;
}


openDeepLink._promise =
  (async function () {

    /*
     * IMPORTANT:
     *
     * We deliberately do NOT require a contract here.
     *
     * The direct-ID route depends on the existing
     * SkyMedia Manifest machinery to supply the full
     * authoritative item.
     */

    const item =
      await waitForManifestItem(
        target,
        10000
      );


    if (!item) {

      console.error(
        "[ShareManager] Shared item was not " +
        "found in Manifest:",
        target
      );


      return false;
    }


    /*
     * Launch the existing standalone ShareViewer.
     */

    return await startShareMode(
      item,
      target
    );

  })();


try {

  return await openDeepLink._promise;

} finally {

  openDeepLink._promise =
    null;
}


}

/* =====================================================
PUBLIC API
===================================================== */

return {


normalizeSection:
  normalizeSection,

buildMinimalItem:
  buildMinimalItem,

encodeSelectedItem:
  encodeSelectedItem,

buildUrl:
  buildUrl,

share:
  share,

readTarget:
  readTarget,

isShareDeepLink:
  isShareDeepLink,

openDeepLink:
  openDeepLink


};

})();
