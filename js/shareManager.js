"use strict";

/*
=========================================================
 SkyMedia Share Manager
 --------------------------------------------------------
 PURPOSE
 - Creates an isolated share URL containing ONLY the
   selected item.
 - Uses the existing GlideContract SR2 codec.
 - Preserves section + id.
 - Does NOT require Glide to know that Share was pressed.
 - Does NOT use the Cloudflare KV/short-link system.
 - On a shared URL, hands the isolated item directly to
   the existing ShareViewer.

 IMPORTANT
 - ShareViewer is the existing standalone Share Mode UI.
 - This file does NOT rebuild or modify ShareViewer.
=========================================================
*/

window.ShareManager = (function () {

    const CONTRACT_PARAM = "contractz";
    const SECTION_PARAM = "section";
    const ID_PARAM = "id";

    /*
    ---------------------------------------------------------
    Normalize section names
    ---------------------------------------------------------
    */
    function normalizeSection(section) {
        const value = String(section || "").trim().toLowerCase();

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


    /*
    ---------------------------------------------------------
    Clean strings
    ---------------------------------------------------------
    */
    function cleanString(value) {
        if (value === null || value === undefined) {
            return "";
        }

        return String(value).trim();
    }


    /*
    ---------------------------------------------------------
    Normalize media
    ---------------------------------------------------------
    Preserve:
      - string media
      - array media
    ---------------------------------------------------------
    */
    function normalizeMedia(media) {
        if (Array.isArray(media)) {
            return media
                .map(cleanString)
                .filter(Boolean);
        }

        return cleanString(media);
    }


    /*
    ---------------------------------------------------------
    Build the minimal authoritative item.

    We deliberately serialize ONLY the selected item.

    Runtime-only projections such as:
      pdf
      book
      video
      videoUrl
      slides
      slideshow

    are NOT serialized.
    ---------------------------------------------------------
    */
    function buildMinimalItem(item) {

        if (!item || typeof item !== "object") {
            return null;
        }

        const result = {
            id: cleanString(item.id),
            type: cleanString(item.type).toLowerCase(),
            title: cleanString(item.title),
            subtitle: cleanString(item.subtitle),
            thumbnail: cleanString(item.thumbnail),
            media: normalizeMedia(item.media),
            audio: cleanString(item.audio),
            author: cleanString(item.author),
            category: cleanString(item.category),
            date: cleanString(item.date)
        };

        /*
        Preserve dateAdd when it exists because some existing
        contracts may still carry it. It does not replace date.
        */
        if (
            item.dateAdd !== undefined &&
            item.dateAdd !== null &&
            cleanString(item.dateAdd)
        ) {
            result.dateAdd = cleanString(item.dateAdd);
        }

        return result;
    }


    /*
    ---------------------------------------------------------
    Encode ONLY the selected item using the existing SR2
    GlideContract codec.
    ---------------------------------------------------------
    */
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

        const minimalItem = buildMinimalItem(item);

        if (!minimalItem || !minimalItem.id) {
            throw new Error(
                "Cannot create share link: selected item has no id."
            );
        }

        return GlideContract.codec.encode([
            minimalItem
        ]);
    }


    /*
    ---------------------------------------------------------
    Decode a share contract directly.

    This is intentionally independent of Manifest.

    The share URL contains exactly one item, so we can decode
    that item directly instead of waiting for the normal
    catalog/Manifest processing.
    ---------------------------------------------------------
    */
    function decodeContract(payload) {

        if (!payload) {
            throw new Error(
                "Share contract is missing."
            );
        }

        if (
            !window.GlideContract ||
            !GlideContract.codec ||
            typeof GlideContract.codec.decode !== "function"
        ) {
            throw new Error(
                "GlideContract SR2 decoder is not available."
            );
        }

        const decoded = GlideContract.codec.decode(payload);

        let items = decoded;

        if (
            decoded &&
            typeof decoded === "object" &&
            !Array.isArray(decoded) &&
            Array.isArray(decoded.content)
        ) {
            items = decoded.content;
        }

        if (!Array.isArray(items)) {
            throw new Error(
                "Decoded share contract does not contain an item array."
            );
        }

        if (!items.length) {
            throw new Error(
                "Decoded share contract is empty."
            );
        }

        return items;
    }


    /*
    ---------------------------------------------------------
    Read the one shared item.

    Since ShareManager creates one-item contracts, the first
    decoded item is the authoritative shared item.
    ---------------------------------------------------------
    */
    function getDecodedSharedItem() {

        const url = new URL(
            window.location.href
        );

        const payload =
            url.searchParams.get(CONTRACT_PARAM);

        if (!payload) {
            return null;
        }

        const items = decodeContract(payload);

        const targetId =
            cleanString(
                url.searchParams.get(ID_PARAM)
            );

        /*
        Prefer the URL id if present. This gives us an
        additional validation that the contract and target
        agree.
        */
        if (targetId) {
            const matching =
                items.find(function (item) {
                    return (
                        item &&
                        cleanString(item.id) === targetId
                    );
                });

            if (matching) {
                return matching;
            }
        }

        return items[0] || null;
    }


    /*
    ---------------------------------------------------------
    Base URL

    Strip the current query and hash completely.

    This is important because the generated share URL must
    NOT retain the original full Glide contract.
    ---------------------------------------------------------
    */
    function baseUrl() {

        const url = new URL(
            window.location.href
        );

        url.search = "";
        url.hash = "";

        return url.toString();
    }


    /*
    ---------------------------------------------------------
    Build isolated share URL
    ---------------------------------------------------------
    */
    function buildUrl(section, id, item) {

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
            new URL(baseUrl());

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


    /*
    ---------------------------------------------------------
    Copy helper
    ---------------------------------------------------------
    */
    async function copyToClipboard(text) {

        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function"
        ) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (error) {
                console.warn(
                    "Clipboard API failed:",
                    error
                );
            }
        }

        /*
        Older-browser fallback.
        */
        try {

            const textarea =
                document.createElement("textarea");

            textarea.value = text;
            textarea.setAttribute(
                "readonly",
                ""
            );

            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            textarea.style.top = "0";

            document.body.appendChild(
                textarea
            );

            textarea.select();

            const copied =
                document.execCommand("copy");

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


    /*
    ---------------------------------------------------------
    Share selected item
    ---------------------------------------------------------
    */
    async function share(section, item) {

        if (!item || typeof item !== "object") {
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
        -----------------------------------------------------
        Native share
        -----------------------------------------------------
        */
        if (
            navigator.share &&
            typeof navigator.share === "function"
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
                User cancellation is not a failure that should
                prevent the clipboard fallback.
                */
                console.warn(
                    "Native share was not completed:",
                    error
                );
            }
        }

        /*
        -----------------------------------------------------
        Clipboard fallback
        -----------------------------------------------------
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
        -----------------------------------------------------
        Last-resort prompt
        -----------------------------------------------------
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


    /*
    ---------------------------------------------------------
    Read deep-link target
    ---------------------------------------------------------
    */
    function readTarget() {

        const url =
            new URL(window.location.href);

        const section =
            normalizeSection(
                url.searchParams.get(
                    SECTION_PARAM
                )
            );

        const id =
            cleanString(
                url.searchParams.get(
                    ID_PARAM
                )
            );

        const contract =
            url.searchParams.get(
                CONTRACT_PARAM
            );

        return {
            section: section,
            id: id,
            contract: contract
        };
    }


    /*
    ---------------------------------------------------------
    Determine whether this page is an actual isolated
    Share Mode URL.

    We require all three:
      contractz
      section
      id

    This prevents ordinary SkyMedia navigation from being
    intercepted accidentally.
    ---------------------------------------------------------
    */
    function isShareDeepLink() {

        const target =
            readTarget();

        return !!(
            target.contract &&
            target.section &&
            target.id
        );
    }


    /*
    ---------------------------------------------------------
    Wait for the existing ShareViewer API.

    IMPORTANT:
    The previous version checked window.ShareViewer only
    once. That created a startup race.

    Here we wait for it to become available.

    We do NOT fall back to the normal viewer.

    A URL containing contractz + section + id is explicitly
    a Share Mode request.
    ---------------------------------------------------------
    */
    function waitForShareViewer(
        timeoutMs = 10000
    ) {

        return new Promise(function (resolve) {

            const startedAt =
                Date.now();

            function check() {

                if (
                    window.ShareViewer &&
                    typeof ShareViewer.start === "function"
                ) {
                    resolve(true);
                    return;
                }

                if (
                    Date.now() - startedAt >=
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
        });
    }


    /*
    ---------------------------------------------------------
    Wait for ShareViewer and start Share Mode.

    This is deliberately isolated from the normal viewer.

    If ShareViewer isn't ready yet, we wait.

    If ShareViewer becomes available, we call its existing
    start(item, target) API exactly as it was designed.
    ---------------------------------------------------------
    */
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
                "Share Mode handoff failed: " +
                "ShareViewer.start() did not become available."
            );

            return false;
        }

        try {

            await ShareViewer.start(
                item,
                {
                    section: target.section,
                    id: target.id
                }
            );

            return true;

        } catch (error) {

            console.error(
                "ShareViewer.start() failed:",
                error
            );

            return false;
        }
    }


    /*
    ---------------------------------------------------------
    Open Share Mode from the current URL.

    This is the key change from the previous revision.

    There is NO normal-viewer fallback.

    If the URL contains an isolated share contract, this
    function waits for ShareViewer and hands the item to it.
    ---------------------------------------------------------
    */
    async function openDeepLink() {

        const target =
            readTarget();

        /*
        Ordinary SkyMedia URL:
        do absolutely nothing.
        */
        if (
            !target.contract ||
            !target.section ||
            !target.id
        ) {
            return false;
        }

        let item;

        try {

            item =
                getDecodedSharedItem();

        } catch (error) {

            console.error(
                "Could not decode Share Mode contract:",
                error
            );

            return false;
        }

        if (!item) {

            console.error(
                "Share Mode contract did not contain an item."
            );

            return false;
        }

        /*
        Validate that the selected URL target and item agree.
        */
        if (
            cleanString(item.id) !==
            cleanString(target.id)
        ) {

            console.error(
                "Share Mode id mismatch:",
                {
                    urlId: target.id,
                    itemId: item.id
                }
            );

            return false;
        }

        /*
        Prevent duplicate startup attempts if openDeepLink()
        is accidentally called more than once.
        */
        if (openDeepLink._promise) {
            return openDeepLink._promise;
        }

        openDeepLink._promise =
            startShareMode(
                item,
                target
            );

        try {

            return await openDeepLink._promise;

        } finally {

            openDeepLink._promise = null;
        }
    }


    /*
    ---------------------------------------------------------
    Public API
    ---------------------------------------------------------
    */
    return {

        normalizeSection,
        buildMinimalItem,
        encodeSelectedItem,
        decodeContract,
        buildUrl,
        share,
        readTarget,
        isShareDeepLink,
        openDeepLink

    };

})();