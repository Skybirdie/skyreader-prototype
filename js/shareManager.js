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
     PRIME KV AND CREATE SHORT SHARE URL
     ========================================================= */

  async function shorten(longUrl) {

    if (!longUrl) {
      throw new Error("ShareManager: missing share URL.");
    }

    const url = new URL(longUrl);
    const key = url.searchParams.get("k");
    const contractz = url.searchParams.get("contractz");
    const section = url.searchParams.get("section") || "";
    const id = url.searchParams.get("id") || "";

    if (!key || !contractz) {
      throw new Error("ShareManager: incomplete first-use URL.");
    }

    const response = await fetch(
      SKYMEDIA_BASE_URL + "/__sky_share_prime",
      {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          k: key,
          contractz,
          section,
          id
        })
      }
    );

    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json())?.error || ""; } catch (_) {}
      throw new Error(
        "ShareManager: unable to create the short share link" +
        (detail ? " — " + detail : " (" + response.status + ")")
      );
    }

    const data = await response.json();

    if (!data || typeof data.url !== "string" || !data.url) {
      throw new Error("ShareManager: Worker returned an invalid short share link.");
    }

    return data.url;
  }


  /* =========================================================
     SHARE FEEDBACK TOAST
     ========================================================= */

  function showShareToast(message, kind = "info") {
    let toast = document.getElementById("skymediaShareToast");

    /*
      A fullscreen element lives in the browser's top layer.
      Anything outside that element can be hidden behind it.
      When the document itself is fullscreen, append the toast
      there so it remains visible. For video fullscreen (where
      a <video> element cannot contain children), the native
      browser controls remain authoritative and the toast falls
      back to the nearest document-level overlay.
    */
    const fs = document.fullscreenElement;
    const host = fs && fs !== document.documentElement &&
                 fs instanceof HTMLElement ? fs : document.body;

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "skymediaShareToast";
      toast.className = "skymedia-share-toast";
    }

    if (toast.parentElement !== host) host.appendChild(toast);

    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.remove("visible");
    void toast.offsetWidth;
    toast.classList.add("visible");

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 2800);
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

    try {
      if (!item || !item.id) {
        throw new Error("ShareManager: cannot share an item without an id.");
      }

      const normalizedSection = normalizeSection(section);
      const firstUseUrl = buildLongUrl(normalizedSection, item.id);

      /*
        The short URL itself can be constructed synchronously from
        the deterministic key. Start KV priming immediately, but do
        not wait for the network before invoking navigator.share.
        This preserves the browser's user-activation window.
      */
      const firstUse = new URL(firstUseUrl);
      const shareUrl = new URL(SKYMEDIA_BASE_URL);
      shareUrl.searchParams.set("k", firstUse.searchParams.get("k"));
      shareUrl.searchParams.set("section", firstUse.searchParams.get("section"));
      shareUrl.searchParams.set("id", firstUse.searchParams.get("id"));
      const shortUrl = shareUrl.toString();

      const primePromise = shorten(firstUseUrl);

      if (navigator.share && typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: item.title || "SkyMedia",
            text: item.title
              ? `View ${item.title} in SkyMedia`
              : "View this item in SkyMedia",
            url: shortUrl
          });

          /* Ensure KV is actually ready before reporting success. */
          try {
            await primePromise;
            showShareToast("Share link sent.", "success");
          } catch (primeError) {
            showShareToast("Share opened, but the link could not be prepared.", "error");
            console.error(primeError);
          }

          return shortUrl;
        } catch (error) {
          if (error && error.name === "AbortError") {
            /* User cancelled; do not claim success. */
            showShareToast("Share cancelled.", "info");
            return shortUrl;
          }
          /* Other native-share failures fall through to clipboard. */
        }
      }

      let preparedUrl;
      try {
        preparedUrl = await primePromise;
      } catch (error) {
        showShareToast("Unable to create share link.", "error");
        console.error(error);
        return null;
      }

      const copied = await copyToClipboard(preparedUrl);

      if (copied) {
        showShareToast("Link copied.", "success");
        return preparedUrl;
      }

      showShareToast("Share link created, but could not copy it.", "error");
      return preparedUrl;

    } catch (error) {
      showShareToast("Unable to create share link.", "error");
      console.error(error);
      return null;
    }
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
     SHARE MODE DETECTION
     ========================================================= */

  function isShareMode() {

    const target = readTarget();

    return !!(
      target &&
      target.section &&
      target.id
    );
  }


  function getShareTarget() {

    return readTarget();

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
    openDeepLink,

    isShareMode,
    getShareTarget

  };

})();
