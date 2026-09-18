"use strict";

/*
=========================================================
 SkyMedia Share Manager
 --------------------------------------------------------
 FINAL SHORT-LINK VERSION

 PURPOSE

 1. Create an isolated SR2 share contract containing ONLY
    the selected item.

 2. Send that contract to the Cloudflare Worker.

 3. Worker stores the contract in MEDIA_KV and returns:

      /s/<16-character-key>

 4. The public URL contains NO:
      - contractz
      - section
      - id

 5. On a shared URL, the Worker supplies the isolated
    contract to the existing GlideContract/Manifest
    machinery.

 6. Existing ShareViewer opens the selected item.

 IMPORTANT

 - No Cloudflare KV logic is performed here.
 - No catalog is created.
 - ShareViewer is not rebuilt.
 - No normal Front Page fallback is used.
 - No browser alert is used.
=========================================================
*/

window.ShareManager = (function () {

    const CONTRACT_PARAM = "contractz";

    const PRIME_PATH =
        "/__sky_share_prime";


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
       ENCODE SELECTED ITEM
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
                    "[ShareManager] Clipboard API failed:",
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
                "[ShareManager] Clipboard fallback failed:",
                error
            );

            return false;
        }
    }


    /* =====================================================
       PRIME WORKER

       Sends the isolated contract to Cloudflare.

       Worker creates the short key and stores the payload.
    ===================================================== */

    async function primeWorker(
        payload,
        section,
        id
    ) {

        const response =
            await fetch(
                PRIME_PATH,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            contractz:
                                payload,

                            section:
                                normalizeSection(
                                    section
                                ),

                            id:
                                cleanString(id)
                        })
                }
            );


        if (!response.ok) {

            let message =
                "SkyMedia share server returned " +
                response.status +
                ".";


            try {

                const data =
                    await response.json();

                if (
                    data &&
                    data.error
                ) {
                    message =
                        String(
                            data.error
                        );
                }

            } catch (_) {
                /* keep default message */
            }


            throw new Error(
                message
            );
        }


        const data =
            await response.json();


        if (
            !data ||
            !data.url
        ) {

            throw new Error(
                "SkyMedia share server did not return a short URL."
            );
        }


        return String(
            data.url
        );
    }


    /* =====================================================
       BUILD SHORT SHARE URL
    ===================================================== */

    async function buildUrl(
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


        return await primeWorker(
            payload,
            normalizedSection,
            normalizedId
        );
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


        const itemId =
            cleanString(
                item.id
            );


        if (!itemId) {

            throw new Error(
                "Cannot share: selected item has no id."
            );
        }


        /*
         * First create the actual short Worker URL.
         */

        const url =
            await buildUrl(
                normalizedSection,
                itemId,
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
                 * User cancellation is not a fatal error.
                 * Fall through to clipboard.
                 */

                console.warn(
                    "[ShareManager] Native share was not completed:",
                    error
                );
            }
        }


        /*
         * Clipboard.
         *
         * IMPORTANT:
         *
         * There is deliberately NO alert() here.
         *
         * This avoids:
         *
         * "An embedded page at ... says
         * Share link copied to clipboard."
         */

        const copied =
            await copyToClipboard(
                url
            );


        if (copied) {

            console.log(
                "[ShareManager] Link copied."
            );

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
                "[ShareManager] Share URL:",
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


        /*
         * FINAL SHORT URL:
         *
         * /s/<key>
         *
         * The Worker bootstrap supplies the actual target
         * internally through window.__SKY_SHARE_TARGET.
         */

        if (
            window.__SKY_SHARE_TARGET &&
            typeof window.__SKY_SHARE_TARGET ===
                "object"
        ) {

            const internal =
                window.__SKY_SHARE_TARGET;


            const internalSection =
                normalizeSection(
                    internal.section
                );


            const internalId =
                cleanString(
                    internal.id
                );


            const internalContract =
                cleanString(
                    window.__SKY_SHARE_PAYLOAD
                );


            if (
                internalSection &&
                internalId &&
                internalContract
            ) {

                return {

                    section:
                        internalSection,

                    id:
                        internalId,

                    contract:
                        internalContract
                };
            }
        }


        /*
         * Legacy/direct contract support.
         *
         * This keeps the previously working direct
         * contractz mechanism compatible.
         */

        const section =
            normalizeSection(
                url.searchParams.get(
                    "section"
                )
            );

        const id =
            cleanString(
                url.searchParams.get(
                    "id"
                )
            );

        const contract =
            url.searchParams.get(
                CONTRACT_PARAM
            );


        return {

            section,

            id,

            contract
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
    ===================================================== */

    async function openDeepLink() {

        const target =
            readTarget();


        if (
            !target.contract ||
            !target.section ||
            !target.id
        ) {

            return false;
        }


        if (
            openDeepLink._promise
        ) {

            return openDeepLink._promise;
        }


        openDeepLink._promise =
            (async function () {

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