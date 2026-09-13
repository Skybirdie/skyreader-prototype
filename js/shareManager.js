"use strict";

/* =========================================================
   SkyMedia Share Manager

   KV-BACKED SHARE LINK ARCHITECTURE
   ---------------------------------

   The Share button creates a FIRST-USE URL containing:

       ?k=<16-character-key>
       &contractz=sr2.<FULL-COLLECTION>
       &section=<reader|video|slideshow>
       &id=<item-id>

   Example:

       https://skyreader-prototype.sliburd81.workers.dev/
       ?k=33328C6C09DAF837
       &contractz=sr2.FULL_COLLECTION
       &section=reader
       &id=test2202609120557

   Cloudflare Worker then:

       1. receives the full contract
       2. stores it in MEDIA_KV under the key
       3. redirects to:

          ?k=33328C6C09DAF837
          &section=reader
          &id=test2202609120557

   When that short URL is opened later, Cloudflare:

       1. retrieves the full contract from KV
       2. injects contractz into the SkyMedia page
       3. preserves section + id
       4. SkyMedia opens the requested item

   IMPORTANT:

   - The COMPLETE collection is preserved.
   - We do NOT create a one-item contract.
   - No /api/shorten endpoint is required.
   - Existing deep-link reading logic remains available.
   ========================================================= */

window.ShareManager = (function () {


  /* =========================================================
     CONFIGURATION
     ========================================================= */

  /*
    The Cloudflare Worker / SkyMedia base URL.

    This is deliberately explicit so that the Share button
    always creates a share link pointing at the deployed
    SkyMedia application rather than depending on whatever
    page happens to contain the embedded application.
  */
  const SKYMEDIA_BASE_URL =
    "https://skyreader-prototype.sliburd81.workers.dev";


  /* =========================================================
     SECTION NORMALIZATION
     ========================================================= */

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


  /* =========================================================
     LOCATE CURRENT CONTRACT
     ========================================================= */

  function getCurrentContractz() {

    const current =
      new URL(
        window.location.href
      );


    /*
      Preferred current format.
    */
    const contractz =
      current.searchParams.get(
        "contractz"
      );

    if (contractz) {
      return contractz;
    }


    /*
      Legacy fallback.
    */
    const contract =
      current.searchParams.get(
        "contract"
      );

    if (contract) {
      return contract;
    }


    /*
      Older legacy fallback.
    */
    const books =
      current.searchParams.get(
        "books"
      );

    if (books) {
      return books;
    }


    /*
      Some SkyMedia startup configurations may have already
      decoded the contract into a global variable.

      Try a few safe possibilities without changing the
      application's existing contract system.
    */

    try {

      if (
        window.Manifest &&
        typeof window.Manifest.getContractz ===
          "function"
      ) {

        const value =
          window.Manifest.getContractz();

        if (value) {
          return String(value);
        }
      }

    } catch (_) {
      // Continue.
    }


    return "";
  }


  /* =========================================================
     FNV-1A 32-BIT HASH

     MUST MATCH THE GLIDE GENERATOR AND CLOUDFLARE WORKER.
     ========================================================= */

  function fnv1a32(
    value,
    seed
  ) {

    let hash =
      (0x811c9dc5 ^ seed) >>> 0;


    for (
      let i = 0;
      i < value.length;
      i++
    ) {

      hash ^=
        value.charCodeAt(i);

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


  /*
    Generate the same 16-character key used by Glide.
  */
  function makeKVKey(payload) {

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
     BUILD FIRST-USE KV URL
     ========================================================= */

  function buildLongUrl(
    section,
    id
  ) {

    const normalizedSection =
      normalizeSection(
        section
      );


    const itemId =
      String(id || "")
        .trim();


    if (!normalizedSection) {

      throw new Error(
        "ShareManager: missing section."
      );
    }


    if (!itemId) {

      throw new Error(
        "ShareManager: missing item id."
      );
    }


    /*
      Get the COMPLETE current contract.
    */
    const contractz =
      getCurrentContractz();


    if (!contractz) {

      throw new Error(
        "ShareManager: no complete SkyMedia contract was found."
      );
    }


    /*
      Validate that it looks like the expected C2.2 contract.
    */
    if (
      !contractz.startsWith("sr2.")
    ) {

      throw new Error(
        "ShareManager: current contract is not a valid sr2 contract."
      );
    }


    /*
      Generate the deterministic KV key from the EXACT
      contract payload.

      This matches the Glide generator and Cloudflare Worker.
    */
    const kvKey =
      makeKVKey(
        contractz
      );


    /*
      Build the first-use URL.

      IMPORTANT:

      The contract remains in this URL on first use.

      Cloudflare needs it so that it can put the contract
      into MEDIA_KV.
    */
    const url =
      new URL(
        SKYMEDIA_BASE_URL
      );


    url.searchParams.set(
      "k",
      kvKey
    );


    url.searchParams.set(
      "contractz",
      contractz
    );


    /*
      Preserve the requested application destination.
    */
    url.searchParams.set(
      "section",
      normalizedSection
    );


    url.searchParams.set(
      "id",
      itemId
    );


    return url.toString();
  }


  /* =========================================================
     SHARE FEEDBACK
     ========================================================= */

  let shareNoticeTimer = null;

  function showShareNotice(message, isSuccess = true) {
    let notice = document.getElementById("skyShareNotice");

    if (!notice) {
      notice = document.createElement("div");
      notice.id = "skyShareNotice";
      notice.className = "sky-share-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      document.body.appendChild(notice);
    }

    notice.textContent = message;
    notice.classList.toggle("is-error", !isSuccess);
    notice.classList.add("is-visible");

    if (shareNoticeTimer) {
      clearTimeout(shareNoticeTimer);
    }

    shareNoticeTimer = setTimeout(() => {
      notice.classList.remove("is-visible");
    }, 2600);
  }

  function installShareNoticeStyles() {
    if (document.getElementById("skyShareNoticeStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "skyShareNoticeStyles";
    style.textContent = `
      .sky-share-notice {
        position: fixed;
        left: 50%;
        bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        transform: translate(-50%, 14px);
        z-index: 2147483647;
        max-width: min(88vw, 420px);
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(20,20,20,.94);
        color: #fff;
        font: 600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
        letter-spacing: .01em;
        box-shadow: 0 6px 24px rgba(0,0,0,.28);
        opacity: 0;
        pointer-events: none;
        transition: opacity .18s ease, transform .18s ease;
      }
      .sky-share-notice.is-visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }
      .sky-share-notice.is-error {
        background: rgba(120,35,35,.96);
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installShareNoticeStyles, { once: true });
  } else {
    installShareNoticeStyles();
  }


  /* =========================================================
     COPY HELPER
     ========================================================= */

  async function copyToClipboard(text) {
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // Continue to the legacy fallback.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;

    try {
      copied = document.execCommand("copy");
    } catch (_) {
      copied = false;
    }

    textarea.remove();
    return copied;
  }


  /* =========================================================
     PRIME KV AND CREATE SHORT SHARE URL

     The request is deliberately started WITHOUT awaiting it.
     This is important because navigator.share() requires the
     original user gesture. Awaiting a network request first can
     cause browsers to reject navigator.share() with a
     NotAllowedError.
     ========================================================= */

  function primeKV(longUrl) {
    if (!longUrl) {
      return Promise.reject(
        new Error("ShareManager: missing share URL.")
      );
    }

    const source = new URL(longUrl);
    const endpoint = new URL(
      "/__sky_share_prime",
      SKYMEDIA_BASE_URL
    );

    const payload = {
      k: source.searchParams.get("k") || "",
      contractz: source.searchParams.get("contractz") || "",
      section: source.searchParams.get("section") || "",
      id: source.searchParams.get("id") || ""
    };

    return fetch(endpoint.toString(), {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(async response => {
      if (!response.ok) {
        let detail = "";
        try {
          detail = await response.text();
        } catch (_) {}
        throw new Error(
          "ShareManager: short-link setup failed (" +
          response.status +
          ")" +
          (detail ? ": " + detail : ".")
        );
      }

      const data = await response.json();

      if (
        !data ||
        data.ok !== true ||
        typeof data.url !== "string" ||
        !data.url
      ) {
        throw new Error(
          "ShareManager: Worker returned an invalid short share link."
        );
      }

      return data.url;
    });
  }


  async function shorten(longUrl) {
    return primeKV(longUrl);
  }


  /* =========================================================
     SHARE
     ========================================================= */

  async function share(section, item) {
    if (!item || !item.id) {
      showShareNotice("Unable to share this item.", false);
      throw new Error(
        "ShareManager: cannot share an item without an id."
      );
    }

    const normalizedSection = normalizeSection(section);
    const firstUseUrl = buildLongUrl(
      normalizedSection,
      item.id
    );

    /*
      The short URL is deterministic. Start KV priming now,
      but do NOT await it before calling navigator.share().
      That preserves the browser's user-gesture activation.
    */
    const primePromise = primeKV(firstUseUrl);

    const source = new URL(firstUseUrl);
    const shortUrlPreview = new URL(SKYMEDIA_BASE_URL);
    shortUrlPreview.searchParams.set(
      "k",
      source.searchParams.get("k") || ""
    );
    shortUrlPreview.searchParams.set(
      "section",
      source.searchParams.get("section") || normalizedSection
    );
    shortUrlPreview.searchParams.set(
      "id",
      source.searchParams.get("id") || String(item.id)
    );

    const shareUrl = shortUrlPreview.toString();

    /*
      Native Web Share MUST be attempted while the click/tap
      activation is still alive.
    */
    if (
      navigator.share &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: item.title || "SkyMedia",
          text: item.title
            ? `View ${item.title} in SkyMedia`
            : "View this item in SkyMedia",
          url: shareUrl
        });

        try {
          await primePromise;
          showShareNotice("Share link sent.", true);
        } catch (error) {
          console.error("SkyMedia: KV priming failed after native share.", error);
          showShareNotice("Share started, but link setup failed.", false);
        }

        return shareUrl;
      } catch (error) {
        /*
          AbortError means the user intentionally closed/cancelled
          the native share sheet. Do not unexpectedly copy anything.
        */
        if (error && error.name === "AbortError") {
          return shareUrl;
        }

        /*
          NotAllowedError and other native-share failures fall
          through to the clipboard fallback.
        */
        console.warn("SkyMedia native share unavailable; using clipboard.", error);
      }
    }

    /*
      Desktop browsers and browsers without Web Share use the
      same short URL. Wait for KV setup before copying so the
      copied link is never the long contract URL.
    */
    let readyUrl;

    try {
      readyUrl = await primePromise;
    } catch (error) {
      console.error("SkyMedia: unable to create short share link.", error);
      showShareNotice("Unable to create share link.", false);
      throw error;
    }

    const copied = await copyToClipboard(readyUrl);

    if (copied) {
      showShareNotice("Link copied.", true);
      return readyUrl;
    }

    showShareNotice("Share link created, but could not copy it.", false);
    return readyUrl;
  }


  /* =========================================================
     READ DEEP-LINK TARGET
     ========================================================= */

  function readTarget() {

    const url =
      new URL(
        window.location.href
      );


    const section =
      normalizeSection(
        url.searchParams.get(
          "section"
        )
      );


    const id =
      String(
        url.searchParams.get(
          "id"
        ) || ""
      ).trim();


    if (
      !section ||
      !id
    ) {

      return null;
    }


    return {
      section,
      id
    };
  }


  /* =========================================================
     FIND ITEM IN MANIFEST
     ========================================================= */

  function findManifestItem(
    target
  ) {

    if (!target) {
      return null;
    }


    const manifest =
      window.Manifest;


    if (!manifest) {
      return null;
    }


    /*
      First try the section-specific collection.
    */
    try {

      if (
        typeof manifest.content ===
          "function"
      ) {

        const sectionItems =
          manifest.content(
            target.section
          );


        if (
          Array.isArray(
            sectionItems
          )
        ) {

          const found =
            sectionItems.find(
              item =>
                item &&
                String(item.id) ===
                  String(target.id)
            );


          if (found) {
            return found;
          }
        }
      }

    } catch (_) {
      // Continue to global search.
    }


    /*
      Then search the complete collection.
    */
    try {

      if (
        typeof manifest.all ===
          "function"
      ) {

        const allItems =
          manifest.all();


        if (
          Array.isArray(
            allItems
          )
        ) {

          return (
            allItems.find(
              item =>
                item &&
                String(item.id) ===
                  String(target.id)
            ) ||
            null
          );
        }
      }

    } catch (_) {
      // Continue.
    }


    return null;
  }


  /* =========================================================
     OPEN DEEP-LINKED ITEM
     ========================================================= */

  async function openDeepLink() {

    const target =
      readTarget();


    if (!target) {
      return false;
    }


    const item =
      findManifestItem(
        target
      );


    /*
      Manifest may not have finished loading yet.

      Return false rather than declaring failure.
    */
    if (!item) {
      return false;
    }


    try {

      /* -----------------------------------------------------
         READER
         ----------------------------------------------------- */

      if (
        target.section ===
        "reader"
      ) {

        if (
          window.AppSwitcher &&
          typeof window.AppSwitcher.show ===
            "function"
        ) {

          window.AppSwitcher.show(
            "reader"
          );
        }


        if (
          window.SRNavigation &&
          typeof window.SRNavigation.openMagazine ===
            "function"
        ) {

          await window.SRNavigation.openMagazine(
            item
          );

          return true;
        }
      }


      /* -----------------------------------------------------
         VIDEO
         ----------------------------------------------------- */

      if (
        target.section ===
        "video"
      ) {

        if (
          window.AppSwitcher &&
          typeof window.AppSwitcher.show ===
            "function"
        ) {

          window.AppSwitcher.show(
            "video"
          );
        }


        if (
          window.VideoViewer &&
          typeof window.VideoViewer.openVideo ===
            "function"
        ) {

          await window.VideoViewer.openVideo(
            item
          );

          return true;
        }
      }


      /* -----------------------------------------------------
         SLIDESHOW
         ----------------------------------------------------- */

      if (
        target.section ===
        "slideshow"
      ) {

        if (
          window.AppSwitcher &&
          typeof window.AppSwitcher.show ===
            "function"
        ) {

          window.AppSwitcher.show(
            "slideshow"
          );
        }


        if (
          window.SlideshowViewer &&
          typeof window.SlideshowViewer.open ===
            "function"
        ) {

          await window.SlideshowViewer.open(
            item
          );

          return true;
        }
      }

    } catch (error) {

      console.error(
        "ShareManager: unable to open deep link.",
        error
      );

      return false;
    }


    return false;
  }


  /* =========================================================
     PUBLIC API
     ========================================================= */

  return {

    buildLongUrl,
    shorten,
    share,
    readTarget,
    findManifestItem,
    openDeepLink

  };

})();
