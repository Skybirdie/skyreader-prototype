"use strict";

/*
=========================================================
 SkyMedia Share Manager
 --------------------------------------------------------
 FINAL SHORT-LINK VERSION

 1. Create an isolated SR2 share contract containing ONLY
    the selected item.

 2. Send that isolated contract to the Cloudflare Worker.

 3. Worker stores the contract in KV and returns a short
    /s/<key> URL.

 4. Clipboard success uses a custom "Link copied."
    notification instead of browser alert().

 5. On a shared URL, the existing SkyMedia Manifest
    machinery locates the isolated item.

 6. The EXISTING ShareViewer receives the item.

 IMPORTANT

 - ShareViewer is NOT rebuilt.
 - Glide does NOT need to know which item was shared.
 - Generator does NOT need to know about the Share button.
 - The complete Glide contract is NOT placed in the URL.
 - The selected item remains the only serialized content.
=========================================================
*/

window.ShareManager = (function () {

    const CONTRACT_PARAM = "contractz";
    const SECTION_PARAM = "section";
    const ID_PARAM = "id";

    /*
     * Worker endpoint used to publish a short share URL.
     */
    const SHARE_PRIME_PATH =
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
    ===================================================== */

    function baseUrl() {

        const url =
            new URL(
                window.location.href
            );

        /*
         * Sharing is always based on the Worker origin.
         * This removes the current Glide/application query
         * contract from the share URL.
         */

        url.search = "";
        url.hash = "";

        return url.toString();
    }


    /* =====================================================
       LEGACY / DEBUG URL BUILDER

       Kept for compatibility and diagnostics.

       The actual share() path now asks the Worker for
       the short URL.
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
       CUSTOM "LINK COPIED" NOTIFICATION

       Deliberately NOT window.alert().

       This keeps the notification inside the page and
       avoids the browser-generated:

       "An embedded page at ... says ..."
    ===================================================== */

    function showLinkCopied() {

        const existing =
            document.getElementById(
                "skyShareLinkCopiedToast"
            );

        if (existing) {

            existing.textContent =
                "Link copied.";

            existing.classList.remove(
                "is-visible"
            );

            void existing.offsetWidth;

            existing.classList.add(
                "is-visible"
            );

            window.clearTimeout(
                existing._skyShareToastTimer
            );

            existing._skyShareToastTimer =
                window.setTimeout(
                    function () {

                        existing.classList.remove(
                            "is-visible"
                        );

                    },
                    1800
                );

            return;
        }


        const toast =
            document.createElement(
                "div"
            );

        toast.id =
            "skyShareLinkCopiedToast";

        toast.textContent =
            "Link copied";


        Object.assign(
            toast.style,
            {
                position: "fixed",
                left: "50%",
                bottom: "28px",
                transform:
                    "translate(-50%, 12px)",
                zIndex: "2147483647",

                padding:
                    "9px 16px",

                borderRadius:
                    "999px",

                background:
                    "#00A550E0",

                color:
                    "#fff",

                fontFamily:
                    "system-ui, -apple-system, BlinkMacSystemFont, " +
                    "\"Segoe UI\", sans-serif",

                fontSize:
                    "14px",

                fontWeight:
                    "600",

                lineHeight:
                    "1.2",

                whiteSpace:
                    "nowrap",

                boxShadow:
                    "0 6px 24px rgba(0,0,0,.25)",

                opacity:
                    "0",

                pointerEvents:
                    "none",

                transition:
                    "opacity .18s ease, transform .18s ease"
            }
        );


        document.body.appendChild(
            toast
        );


        requestAnimationFrame(
            function () {

                toast.style.opacity =
                    "1";

                toast.style.transform =
                    "translate(-50%, 0)";
            }
        );


        toast._skyShareToastTimer =
            window.setTimeout(
                function () {

                    toast.style.opacity =
                        "0";

                    toast.style.transform =
                        "translate(-50%, 12px)";


                    window.setTimeout(
                        function () {

                            toast.remove();

                        },
                        220
                    );

                },
                1800
            );
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
       ASK WORKER FOR SHORT SHARE URL
    ===================================================== */

    async function createShortShareUrl(
        payload,
        section,
        id
    ) {

        const endpoint =
            new URL(
                SHARE_PRIME_PATH,
                window.location.origin
            );


        const response =
            await fetch(
                endpoint.toString(),
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
                                section,

                            id:
                                id
                        })
                }
            );


        if (!response.ok) {

            const text =
                await response.text()
                    .catch(() => "");

            throw new Error(
                "Short share URL request failed (" +
                response.status +
                ")" +
                (text
                    ? ": " + text
                    : "")
            );
        }


        const result =
            await response.json();


        const url =
            cleanString(
                result?.url
            );


        if (!url) {

            throw new Error(
                "Worker did not return a short share URL."
            );
        }


        return url;
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


        const normalizedId =
            cleanString(item.id);


        if (!normalizedId) {

            throw new Error(
                "Cannot share: selected item has no id."
            );
        }


        /*
         * Build exactly the same isolated-item SR2 payload
         * that the working version uses.
         */

        const payload =
            encodeSelectedItem(item);


        /*
         * Worker stores the payload in KV and returns:

            /s/<short-key>

         * No long contract appears in the final URL.
         */

        const url =
            await createShortShareUrl(
                payload,
                normalizedSection,
                normalizedId
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
                 * Continue to clipboard if the native
                 * share sheet was cancelled or unavailable.
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
            await copyToClipboard(
                url
            );


        if (copied) {

            showLinkCopied();

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


        /*
         * Short URLs use:

             /s/<key>

         * The Worker has already recovered the original
         * section/id and injected the contract. The browser
         * may therefore arrive without query parameters.

         * Keep support for the current ?contractz=... format
         * as well.
         */

        const pathParts =
            url.pathname
                .split("/")
                .filter(Boolean);


        const shortKey =
            pathParts.length >= 2 &&
            pathParts[0].toLowerCase() === "s"
                ? cleanString(pathParts[1])
                : "";


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

            key:
                shortKey
        };
    }


    /* =====================================================
       IS THIS A SHARE DEEP LINK?
    ===================================================== */

    function isShareDeepLink() {

        const target =
            readTarget();


        /*
         * Short-link form.
         */

        if (target.key) {
            return true;
        }


        /*
         * Legacy direct-contract form.
         */

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


        /*
         * For a short-link request, the Worker bootstrap
         * supplies section/id in the URL before the app
         * starts.
         *
         * If the Worker does not expose them in the URL,
         * Manifest still contains exactly one item. In that
         * case use the isolated Manifest item.
         */

        const type =
            sectionType(
                target.section
            );


        if (
            wantedId &&
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

                    /*
                     * First try exact id.
                     */

                    if (wantedId) {

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


                    /*
                     * A short share contract contains
                     * exactly one item. If section/id are
                     * not yet available, that one item is
                     * still authoritative.
                     */

                    if (
                        target.key &&
                        items.length === 1
                    ) {

                        return items[0];
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


        /*
         * Short-link requests are identified by /s/<key>.
         *
         * Legacy direct contract requests continue to work
         * when section/id/contract are present.
         */

        if (
            !target.key &&
            (
                !target.contract ||
                !target.section ||
                !target.id
            )
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

                /*
                 * The Worker has already injected the recovered
                 * isolated contract into the application startup.
                 *
                 * Do NOT decode contractz ourselves.
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
                 * For short links, section/id should normally
                 * have been supplied by the Worker bootstrap.
                 *
                 * If not, derive them from the item.
                 */

                const effectiveTarget = {

                    section:
                        target.section ||
                        normalizeSection(
                            item.type
                        ),

                    id:
                        target.id ||
                        cleanString(
                            item.id
                        )
                };


                return await startShareMode(
                    item,
                    effectiveTarget
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

