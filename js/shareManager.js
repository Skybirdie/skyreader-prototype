"use strict";

/*
=========================================================
 SkyMedia Share Manager
 --------------------------------------------------------
 PURPOSE

 1. Create an isolated SR2 share contract containing ONLY
    the selected item.

 2. Preserve section + id in the URL.

 3. On a shared URL, locate the selected item using the
    existing SkyMedia Manifest/GlideContract machinery.

 4. Hand the item to the EXISTING ShareViewer.

 IMPORTANT

 - This does NOT use Cloudflare KV.
 - This does NOT create a catalog.
 - This does NOT rebuild ShareViewer.
 - This does NOT fall back to the normal Front Page viewer.
=========================================================
*/

window.ShareManager = (function () {

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

       ONLY the selected item is serialized.

       Runtime fields are intentionally omitted.
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


        /*
         * Preserve dateAdd if present.
         *
         * date remains the authoritative visibility date.
         */

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
       ENCODE SELECTED ITEM

       Uses the EXISTING SR2 codec.
    ===================================================== */

    function encodeSelectedItem(item) {

        if (
            !window.GlideContract ||
            !GlideContract.codec ||
            typeof GlideContract.codec.encode !==
                "function"
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

       Remove the current query/hash so the original full
       Glide contract is NOT copied into the share link.
    ===================================================== */

    function baseUrl() {

        const url =
            new URL(
                window.location.href
            );

        url.search = "";
        url.hash = "";

        return url.toString();
    }


    /* =====================================================
       BUILD ISOLATED SHARE URL
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


        const payload =
            encodeSelectedItem(item);


        const url =
            new URL(
                baseUrl()
            );


        url.searchParams.set(
            CONTRACT_PARAM,
            payload
        );


        url.searchParams.set(
            SECTION_PARAM,
            normalizedSection
        );


        url.searchParams.set(
            ID_PARAM,
            normalizedId
        );


        return url.toString();
    }


    /* =====================================================
       CLIPBOARD
    ===================================================== */

    async function copyToClipboard(text) {

        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText ===
                "function"
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


        if (!cleanString(item.id)) {

            throw new Error(
                "Cannot share: selected item has no id."
            );
        }


        const url =
            buildUrl(
                normalizedSection,
                item.id,
                item
            );


        const title =
            cleanString(item.title) ||
            "SkyMedia";


        /*
         * Native device share.
         */

        if (
            navigator.share &&
            typeof navigator.share ===
                "function"
        ) {

            try {

                await navigator.share({

                    title: title,

                    text: title,

                    url: url
                });

                return url;

            } catch (error) {

                /*
                 * Continue to clipboard if the native share
                 * sheet was cancelled or unavailable.
                 */

                console.warn(
                    "Native share was not completed:",
                    error
                );
            }
        }


        /*
         * Clipboard.
         */

        const copied =
            await copyToClipboard(url);


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


        /*
         * Last resort.
         */

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
       READ SHARE TARGET
    ===================================================== */

    function readTarget() {

        const url =
            new URL(
                window.location.href
            );


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
                )
        };
    }


    /* =====================================================
       IS THIS A SHARE DEEP LINK?
    ===================================================== */

    function isShareDeepLink() {

        const target =
            readTarget();

        return !!(
            target.contract &&
            target.section &&
            target.id
        );
    }


    /* =====================================================
       SECTION -> MANIFEST TYPE
    ===================================================== */

    function sectionType(section) {

        const normalized =
            normalizeSection(section);

        if (normalized === "reader") {
            return "book";
        }

        if (normalized === "video") {
            return "video";
        }

        if (normalized === "slideshow") {
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

        if (
            !window.Manifest
        ) {
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
            typeof Manifest.content ===
                "function"
        ) {

            try {

                const items =
                    Manifest.content(
                        type
                    );


                if (Array.isArray(items)) {

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
            typeof Manifest.all ===
                "function"
        ) {

            try {

                const items =
                    Manifest.all();


                if (Array.isArray(items)) {

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

       The Worker bootstrap supplies the one-item contract.
       The normal application then processes that contract
       into Manifest.

       We allow that existing process to finish before
       handing control to ShareViewer.
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

       IMPORTANT:

       There is NO normal-viewer fallback.

       A URL containing:

          contractz
          section
          id

       is explicitly a Share Mode request.
    ===================================================== */

    async function openDeepLink() {

        const target =
            readTarget();


        /*
         * Normal SkyMedia navigation.
         */

        if (
            !target.contract ||
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
                 * Do NOT decode contractz ourselves.
                 *
                 * The existing GlideContract/Manifest
                 * startup path is already responsible for
                 * decoding the SR2 payload.
                 *
                 * We wait for that existing path to produce
                 * the isolated item in Manifest.
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
                 * Now wait for the existing standalone
                 * ShareViewer.
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

        normalizeSection,

        buildMinimalItem,

        encodeSelectedItem,

        buildUrl,

        share,

        readTarget,

        isShareDeepLink,

        openDeepLink

    };

})();