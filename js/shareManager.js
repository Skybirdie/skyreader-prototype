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
     CREATE SHARE URL
     ========================================================= */

  async function shorten(
    longUrl
  ) {

    /*
      There is no /api/shorten request anymore.

      The first-use URL itself is the URL that Cloudflare
      needs to see once in order to populate KV.

      Keep this function for API compatibility with any
      existing callers of ShareManager.shorten().
    */

    if (!longUrl) {

      throw new Error(
        "ShareManager: missing share URL."
      );
    }


    return longUrl;
  }


  /* =========================================================
     COPY HELPER
     ========================================================= */

  async function copyToClipboard(
    text
  ) {

    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText ===
        "function"
    ) {

      await navigator.clipboard.writeText(
        text
      );

      return true;
    }


    /*
      Older-browser fallback.
    */
    const textarea =
      document.createElement(
        "textarea"
      );


    textarea.value =
      text;

    textarea.setAttribute(
      "readonly",
      ""
    );

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";


    document.body.appendChild(
      textarea
    );


    textarea.select();


    let copied = false;


    try {

      copied =
        document.execCommand(
          "copy"
        );

    } catch (_) {

      copied = false;
    }


    textarea.remove();


    return copied;
  }


  /* =========================================================
     SHARE
     ========================================================= */

  async function share(
    section,
    item
  ) {

    if (
      !item ||
      !item.id
    ) {

      throw new Error(
        "ShareManager: cannot share an item without an id."
      );
    }


    const normalizedSection =
      normalizeSection(
        section
      );


    /*
      Build the FIRST-USE KV URL.

      This contains:

        k
        contractz
        section
        id
    */
    const shareUrl =
      buildLongUrl(
        normalizedSection,
        item.id
      );


    /*
      Native Web Share.
    */
    if (
      navigator.share &&
      typeof navigator.share ===
        "function"
    ) {

      try {

        await navigator.share({

          title:
            item.title ||
            "SkyMedia",

          text:
            item.title
              ? `View ${item.title} in SkyMedia`
              : "View this item in SkyMedia",

          url:
            shareUrl

        });


        return shareUrl;

      } catch (error) {

        /*
          User cancelled the native share dialog.
        */
        if (
          error &&
          error.name ===
            "AbortError"
        ) {

          return shareUrl;
        }

        /*
          Other share failures fall through to
          clipboard.
        */
      }
    }


    /*
      Clipboard fallback.
    */
    const copied =
      await copyToClipboard(
        shareUrl
      );


    if (copied) {
      return shareUrl;
    }


    /*
      Last resort: return the URL so the caller can display it.
    */
    return shareUrl;
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
