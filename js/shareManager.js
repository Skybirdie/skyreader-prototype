"use strict";

/*
=========================================================
 SkyMedia Share Manager
 --------------------------------------------------------
 RESTORED ARCHITECTURE:

 1. SkyMedia already knows the exact selected item.
 2. ShareManager creates a contract containing ONLY that item.
 3. Existing GlideContract C2.2/SR2 codec encodes that item.
 4. URL contains:
       ?contractz=sr2.<single-item-payload>
       &section=<section>
       &id=<item-id>
 5. Recipient decodes that one-item contract.
 6. ShareManager.openDeepLink() hands the item to the
    EXISTING standalone ShareViewer when available.

 KV / /api/shorten / /__sky_share_prime are NOT used.

 This restores the previously proven isolated-item behavior.
=========================================================
*/


window.ShareManager = (function () {

    /* =====================================================
       SECTION NORMALIZATION
    ===================================================== */

    function normalizeSection(value) {

        const section =
            String(value || "")
                .trim()
                .toLowerCase();

        if (
            section === "book" ||
            section === "books" ||
            section === "reader" ||
            section === "pdf" ||
            section === "pdfs"
        ) {
            return "reader";
        }

        if (
            section === "video" ||
            section === "videos"
        ) {
            return "video";
        }

        if (
            section === "slideshow" ||
            section === "slideshows" ||
            section === "slide" ||
            section === "slides"
        ) {
            return "slideshow";
        }

        return section;
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
       -----------------------------------------------------
       Preserve the authoritative Glide contract shape.

       A slideshow may legitimately contain an array.
       Other media normally arrive as strings.
    ===================================================== */

    function normalizeMedia(value) {

        if (Array.isArray(value)) {

            return value.map(
                item => cleanString(item)
            ).filter(Boolean);
        }

        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return value;
    }


    /* =====================================================
       MINIMAL AUTHORITATIVE ITEM
       -----------------------------------------------------
       IMPORTANT:

       Runtime projections such as:

           pdf
           book
           video
           videoUrl
           slides
           slideshow

       are intentionally NOT serialized.

       The existing GlideContract adapter reconstructs
       those runtime projections when it decodes the SR2
       contract.

       date remains the visibility/release date.
       dateAdd is preserved when present.
    ===================================================== */

    function buildMinimalItem(
        item,
        section
    ) {

        if (!item) {

            throw new Error(
                "ShareManager: no item supplied."
            );
        }

        const normalizedSection =
            normalizeSection(section);

        let type =
            cleanString(item.type)
                .toLowerCase();

        if (!type) {

            if (normalizedSection === "reader") {
                type = "book";
            }
            else if (normalizedSection === "video") {
                type = "video";
            }
            else if (normalizedSection === "slideshow") {
                type = "slideshow";
            }
        }

        if (
            type === "reader" ||
            type === "pdf" ||
            type === "book"
        ) {
            type = "book";
        }
        else if (
            type === "videos" ||
            type === "video"
        ) {
            type = "video";
        }
        else if (
            type === "slide" ||
            type === "slides" ||
            type === "slideshows" ||
            type === "slideshow"
        ) {
            type = "slideshow";
        }

        const id =
            cleanString(item.id);

        if (!id) {

            throw new Error(
                "ShareManager: selected item has no id."
            );
        }

        const minimal = {

            id: id,

            type: type,

            title:
                item.title == null
                    ? ""
                    : String(item.title),

            subtitle:
                item.subtitle == null
                    ? ""
                    : String(item.subtitle),

            thumbnail:
                item.thumbnail == null
                    ? ""
                    : String(item.thumbnail),

            media:
                normalizeMedia(item.media),

            audio:
                item.audio == null
                    ? ""
                    : String(item.audio),

            author:
                item.author == null
                    ? ""
                    : String(item.author),

            category:
                item.category == null
                    ? ""
                    : String(item.category),

            date:
                item.date == null
                    ? ""
                    : String(item.date)
        };


        /*
         * dateAdd is not part of the current authoritative
         * seven-field contract, but older content can contain
         * it. Preserve it when it actually exists.
         */
        if (
            Object.prototype.hasOwnProperty.call(
                item,
                "dateAdd"
            )
        ) {

            minimal.dateAdd =
                item.dateAdd == null
                    ? ""
                    : String(item.dateAdd);
        }


        return minimal;
    }


    /* =====================================================
       ENCODE SELECTED ITEM
       -----------------------------------------------------
       This is the central restoration.

       The old working implementation encoded:

           [minimalItem]

       NOT the complete Glide collection.
    ===================================================== */

    function encodeSelectedItem(
        item,
        section
    ) {

        if (
            !window.GlideContract ||
            !GlideContract.codec ||
            typeof GlideContract.codec.encode !==
                "function"
        ) {

            throw new Error(
                "ShareManager: GlideContract SR2 codec is unavailable."
            );
        }

        const minimalItem =
            buildMinimalItem(
                item,
                section
            );

        return GlideContract.codec.encode(
            [minimalItem]
        );
    }


    /* =====================================================
       DECODE CONTRACT
       -----------------------------------------------------
       Uses the existing GlideContract decoder.

       The decoder may return:
         - an array
         - an object
         - { content: [...] }
    ===================================================== */

    function decodeContract(
        payload
    ) {

        if (
            !window.GlideContract ||
            !GlideContract.codec ||
            typeof GlideContract.codec.decode !==
                "function"
        ) {

            throw new Error(
                "ShareManager: GlideContract SR2 decoder is unavailable."
            );
        }

        let value =
            GlideContract.codec.decode(
                payload
            );

        if (
            value &&
            typeof value === "object" &&
            Array.isArray(value.content)
        ) {

            value =
                value.content;
        }

        if (Array.isArray(value)) {
            return value;
        }

        if (
            value &&
            typeof value === "object"
        ) {
            return [value];
        }

        throw new Error(
            "ShareManager: decoded SR2 contract contains no items."
        );
    }


    /* =====================================================
       BASE URL
       -----------------------------------------------------
       Remove the current query string and hash.

       This is intentional.

       The share URL must NOT inherit the Glide contract,
       current navigation state, or another shared item's
       parameters.
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
       BUILD SHARE URL
       -----------------------------------------------------

       Result:

       https://worker.example/
         ?contractz=sr2.<ONE ITEM>
         &section=slideshow
         &id=abovealllove202609131952
    ===================================================== */

    function buildUrl(
        section,
        id,
        item
    ) {

        const normalizedSection =
            normalizeSection(section);

        const safeId =
            cleanString(id);

        if (!normalizedSection) {

            throw new Error(
                "ShareManager: missing share section."
            );
        }

        if (!safeId) {

            throw new Error(
                "ShareManager: missing share item id."
            );
        }

        const payload =
            encodeSelectedItem(
                item,
                normalizedSection
            );

        const url =
            new URL(
                baseUrl()
            );

        url.searchParams.set(
            "contractz",
            payload
        );

        url.searchParams.set(
            "section",
            normalizedSection
        );

        url.searchParams.set(
            "id",
            safeId
        );

        return url.toString();
    }


    /* =====================================================
       COPY FALLBACK
    ===================================================== */

    async function copyToClipboard(
        value
    ) {

        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText ===
                "function"
        ) {

            try {

                await navigator.clipboard.writeText(
                    value
                );

                return true;

            } catch (_) {
                /* Continue to fallback. */
            }
        }

        try {

            const textarea =
                document.createElement(
                    "textarea"
                );

            textarea.value = value;

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

        } catch (_) {

            return false;
        }
    }


    /* =====================================================
       SHARE
       -----------------------------------------------------
       This method intentionally does NOT:

         - call /api/shorten
         - call /__sky_share_prime
         - generate a KV key
         - serialize the complete Glide collection
         - contact Cloudflare KV

       It shares exactly the item already selected by
       SkyMedia.
    ===================================================== */

    async function share(
        section,
        item
    ) {

        if (!item) {

            throw new Error(
                "ShareManager: no selected item."
            );
        }

        const normalizedSection =
            normalizeSection(section);

        const id =
            cleanString(item.id);

        if (!id) {

            throw new Error(
                "ShareManager: selected item has no id."
            );
        }

        const shareUrl =
            buildUrl(
                normalizedSection,
                id,
                item
            );

        const title =
            cleanString(
                item.title
            ) ||
            "Meditation Mornings";

        /*
         * Native share remains the preferred mechanism.
         */
        if (
            navigator.share &&
            typeof navigator.share ===
                "function"
        ) {

            try {

                await navigator.share({

                    title: title,

                    text:
                        title,

                    url:
                        shareUrl
                });

                return shareUrl;

            } catch (error) {

                /*
                 * Abort/cancel is not an application failure.
                 * The user simply closed the native share sheet.
                 */
                if (
                    error &&
                    error.name ===
                        "AbortError"
                ) {

                    return shareUrl;
                }

                /*
                 * Fall through to clipboard for browsers
                 * where native sharing fails.
                 */
            }
        }


        /*
         * Clipboard fallback.
         */
        const copied =
            await copyToClipboard(
                shareUrl
            );

        if (copied) {

            try {

                window.alert(
                    "Share link copied to clipboard."
                );

            } catch (_) {
                /* Ignore alert failure. */
            }

            return shareUrl;
        }


        /*
         * Final legacy fallback.
         */
        try {

            window.prompt(
                "Copy this share link:",
                shareUrl
            );

        } catch (_) {
            /* Ignore prompt failure. */
        }

        return shareUrl;
    }


    /* =====================================================
       READ DEEP-LINK TARGET
       ===================================================== */

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
            cleanString(
                url.searchParams.get(
                    "id"
                )
            );

        if (
            !section &&
            !id
        ) {
            return null;
        }

        return {
            section,
            id
        };
    }


    /* =====================================================
       FIND ITEM IN DECODED MANIFEST
       -----------------------------------------------------
       The shared contract normally contains exactly one
       item. The section/type checks are retained so that
       malformed links do not accidentally open another type.
    ===================================================== */

    function findManifestItem(
        items,
        target
    ) {

        if (
            !Array.isArray(items) ||
            !items.length
        ) {
            return null;
        }

        const targetId =
            cleanString(
                target?.id
            );

        const targetSection =
            normalizeSection(
                target?.section
            );

        let targetType =
            "";

        if (
            targetSection === "reader"
        ) {
            targetType = "book";
        }
        else if (
            targetSection === "video"
        ) {
            targetType = "video";
        }
        else if (
            targetSection === "slideshow"
        ) {
            targetType = "slideshow";
        }


        /*
         * Exact id + type match first.
         */
        let match =
            items.find(
                item => {

                    const sameId =
                        cleanString(
                            item?.id
                        ) === targetId;

                    if (!sameId) {
                        return false;
                    }

                    if (!targetType) {
                        return true;
                    }

                    return (
                        cleanString(
                            item?.type
                        ).toLowerCase() ===
                        targetType
                    );
                }
            );

        if (match) {
            return match;
        }


        /*
         * ID-only fallback.

         * This is useful with older contracts where the
         * item type was absent or represented differently.
         */
        match =
            items.find(
                item =>
                    cleanString(
                        item?.id
                    ) === targetId
            );

        if (match) {
            return match;
        }


        /*
         * A one-item SR2 contract can safely fall back to
         * its sole item when the target id is absent.
         */
        if (
            items.length === 1 &&
            !targetId
        ) {
            return items[0];
        }

        return null;
    }


    /* =====================================================
       MANIFEST DISCOVERY
       -----------------------------------------------------
       The decoded shared contract is normally enough by
       itself. We deliberately do NOT replace the normal
       application manifest with it.

       Share Mode receives the decoded item directly.
    ===================================================== */

    function getDecodedSharedItem(
        target
    ) {

        const url =
            new URL(
                window.location.href
            );

        const payload =
            url.searchParams.get(
                "contractz"
            );

        if (!payload) {

            throw new Error(
                "ShareManager: no contractz payload in share URL."
            );
        }

        const items =
            decodeContract(
                payload
            );

        const item =
            findManifestItem(
                items,
                target
            );

        if (!item) {

            throw new Error(
                "ShareManager: shared item was not found in the SR2 contract."
            );
        }

        return item;
    }


    /* =====================================================
       NORMAL VIEWER FALLBACKS
       -----------------------------------------------------
       These are retained only as a fallback.

       The preferred path is ShareViewer.start().
    ===================================================== */

    async function openNormalViewer(
        item,
        target
    ) {

        const section =
            normalizeSection(
                target?.section ||
                item?.type
            );


        if (
            section === "reader"
        ) {

            if (
                window.AppSwitcher &&
                typeof AppSwitcher.show ===
                    "function"
            ) {

                AppSwitcher.show(
                    "reader"
                );
            }

            if (
                window.SRNavigation &&
                typeof SRNavigation.openMagazine ===
                    "function"
            ) {

                await SRNavigation.openMagazine(
                    item
                );

                return true;
            }

            if (
                window.Reader &&
                typeof Reader.open ===
                    "function"
            ) {

                await Reader.open(
                    item
                );

                return true;
            }

            throw new Error(
                "ShareManager: no Reader opener is available."
            );
        }


        if (
            section === "video"
        ) {

            if (
                window.AppSwitcher &&
                typeof AppSwitcher.show ===
                    "function"
            ) {

                AppSwitcher.show(
                    "video"
                );
            }

            if (
                window.VideoViewer &&
                typeof VideoViewer.openVideo ===
                    "function"
            ) {

                await VideoViewer.openVideo(
                    item
                );

                return true;
            }

            throw new Error(
                "ShareManager: no Video Viewer opener is available."
            );
        }


        if (
            section === "slideshow"
        ) {

            if (
                window.AppSwitcher &&
                typeof AppSwitcher.show ===
                    "function"
            ) {

                AppSwitcher.show(
                    "slideshow"
                );
            }

            if (
                window.SlideshowViewer &&
                typeof SlideshowViewer.open ===
                    "function"
            ) {

                await SlideshowViewer.open(
                    item
                );

                return true;
            }

            throw new Error(
                "ShareManager: no Slideshow Viewer opener is available."
            );
        }


        throw new Error(
            "ShareManager: unsupported share section: " +
            section
        );
    }


    /* =====================================================
       OPEN DEEP LINK
       -----------------------------------------------------
       IMPORTANT CURRENT SHARE MODE HANDOFF:

       ShareViewer.start(item,target) is preferred.

       This means a recipient does NOT merely enter the
       normal Reader / Video / Slideshow application.

       The exact decoded item is handed directly to the
       standalone Share Mode that already exists.
    ===================================================== */

    async function openDeepLink() {

        const target =
            readTarget();

        if (!target) {
            return false;
        }


        /*
         * A contractz payload is required for the isolated
         * item architecture.
         */
        const url =
            new URL(
                window.location.href
            );

        const payload =
            url.searchParams.get(
                "contractz"
            );

        if (!payload) {

            /*
             * Do not consume unrelated application URLs.
             *
             * A future Worker/KV URL can still be handled
             * elsewhere if desired, but this ShareManager
             * only handles direct SR2 item links.
             */
            return false;
        }


        try {

            const item =
                getDecodedSharedItem(
                    target
                );


            /*
             * ------------------------------------------------
             * PREFERRED CURRENT HANDOFF
             * ------------------------------------------------
             *
             * Existing ShareViewer owns the standalone UI.
             */
            if (
                window.ShareViewer &&
                typeof ShareViewer.start ===
                    "function"
            ) {

                await ShareViewer.start(
                    item,
                    {
                        section:
                            normalizeSection(
                                target.section ||
                                item.type
                            ),

                        id:
                            cleanString(
                                target.id ||
                                item.id
                            )
                    }
                );

                return true;
            }


            /*
             * ------------------------------------------------
             * FALLBACK
             * ------------------------------------------------
             *
             * Retain the proven normal-viewer behavior if
             * ShareViewer is not loaded for some reason.
             */
            return await openNormalViewer(
                item,
                target
            );

        } catch (error) {

            console.error(
                "[SkyMedia Share] Deep-link failed:",
                error
            );

            return false;
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

        findManifestItem,

        openDeepLink

    };

})();

