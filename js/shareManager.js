"use strict";

window.ShareManager = (function () {

    const SECTION_PARAM = "section";
    const ID_PARAM = "id";

    /*
    =========================================================
     SkyMedia Share Manager

     IMPORTANT DESIGN:

     Glide supplies SkyMedia with the complete content contract.

     Once an item is opened, SkyMedia already knows exactly
     which content object the user is viewing.

     Therefore:

       - Glide does NOT need to identify the current row.
       - P1 does NOT need to become row-specific.
       - P3 does NOT need to become row-specific.
       - The full Glide contract is NOT copied into a share URL.

     Instead, when the user shares an item, SkyMedia creates
     a NEW, minimal SR2 contract containing ONLY the selected
     item.

     Example:

       Full incoming contract:
          [book, video, slideshow, video, ...]

     Shared contract:
          [the selected slideshow only]

     The selected section/id are retained as normal query
     parameters so the recipient opens the exact item.

     Result:

       ?contractz=sr2.<small-payload>
       &section=slideshow
       &id=multiimagetest202609060819
    =========================================================
    */


    /*
    =========================================================
     SECTION NORMALIZATION
    =========================================================

     SkyReader internally uses:

       reader
       video
       slideshow

     ContentContract uses:

       book
       video
       slideshow

     A share link uses the application section name.

     Accept a few legacy aliases so this function is safe
     regardless of which section name a caller supplies.
    =========================================================
    */

    function normalizeSection(section) {

        const value =
            String(section ?? "")
                .trim()
                .toLowerCase();

        if (!value) {
            return "";
        }

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
    =========================================================
     MINIMAL SHARE CONTRACT
    =========================================================

     The currently opened item is normally already normalized
     by ContentContract.

     We deliberately create a small authoritative contract
     rather than serializing the entire runtime object.

     These are the fields ContentContract.normalize() uses as
     the authoritative content contract:

       id
       type
       title
       subtitle
       thumbnail
       media
       audio
       author
       category
       date

     dateAdd is retained if it exists, but it is NOT used as
     a substitute for date.

     Runtime compatibility projections such as:

       pdf
       book
       video
       videoUrl
       slides
       slideshow

     do not need to be transmitted because ContentContract
     reconstructs them from the authoritative fields.
    =========================================================
    */

    function buildMinimalItem(item, section) {

        if (
            !item ||
            typeof item !== "object"
        ) {
            return null;
        }

        const id =
            String(item.id ?? "").trim();

        if (!id) {
            return null;
        }


        /*
        -----------------------------------------------------
         Determine the content type.
        -----------------------------------------------------
        */

        let type =
            String(item.type ?? "")
                .trim()
                .toLowerCase();

        const normalizedSection =
            normalizeSection(section);


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


        /*
        -----------------------------------------------------
         Normalize known type aliases.
        -----------------------------------------------------
        */

        if (
            type === "pdf" ||
            type === "book"
        ) {
            type = "book";
        }

        else if (
            type === "videos"
        ) {
            type = "video";
        }

        else if (
            type === "slides" ||
            type === "slideshows"
        ) {
            type = "slideshow";
        }


        /*
        -----------------------------------------------------
         Preserve media exactly as supplied by the normalized
         item.

         Arrays are copied so the original runtime object is
         never modified.
        -----------------------------------------------------
        */

        let media = item.media;

        if (Array.isArray(media)) {

            media =
                media
                    .map(value =>
                        String(value ?? "").trim()
                    )
                    .filter(Boolean);

        }

        else if (
            media !== undefined &&
            media !== null
        ) {

            media =
                String(media).trim();

        }

        else {

            media = "";
        }


        /*
        -----------------------------------------------------
         Preserve audio.

         This can be a URL/string or the normalized audio
         configuration object.
        -----------------------------------------------------
        */

        let audio =
            item.audio;

        if (
            Array.isArray(audio)
        ) {

            audio =
                audio.map(value => {

                    if (
                        value &&
                        typeof value === "object"
                    ) {
                        return {
                            ...value
                        };
                    }

                    return value;
                });

        }

        else if (
            audio &&
            typeof audio === "object"
        ) {

            audio = {
                ...audio
            };

        }


        /*
        -----------------------------------------------------
         Build the minimal authoritative record.
        -----------------------------------------------------
        */

        const minimal = {

            id,

            type,

            title:
                String(item.title ?? ""),

            subtitle:
                String(item.subtitle ?? ""),

            thumbnail:
                String(item.thumbnail ?? ""),

            media,

            audio,

            author:
                String(item.author ?? ""),

            category:
                String(item.category ?? ""),

            date:
                item.date ?? ""
        };


        /*
        -----------------------------------------------------
         Preserve dateAdd when present.

         ContentContract intentionally keeps date as the
         visibility/release date. dateAdd is only provenance
         information.
        -----------------------------------------------------
        */

        if (
            item.dateAdd !== undefined &&
            item.dateAdd !== null &&
            String(item.dateAdd).trim() !== ""
        ) {

            minimal.dateAdd =
                item.dateAdd;
        }


        return minimal;
    }


    /*
    =========================================================
     CREATE MINIMAL SR2 CONTRACT
    =========================================================

     This uses the EXACT codec already implemented in
     glideContract.js.

     We do NOT create another compression algorithm here.

     GlideContract.codec.encode() returns:

       sr2.<compressed-base64url>

     The resulting contract contains one item in an array
     because ContentContract.normalizeManifest() already
     supports an array as a complete manifest source.
    =========================================================
    */

    function encodeSelectedItem(item, section) {

        if (
            !window.GlideContract ||
            !GlideContract.codec ||
            typeof GlideContract.codec.encode !==
                "function"
        ) {

            console.error(
                "[ShareManager] GlideContract SR2 codec is unavailable."
            );

            return "";
        }


        const minimalItem =
            buildMinimalItem(
                item,
                section
            );

        if (!minimalItem) {

            console.error(
                "[ShareManager] Unable to build minimal share contract.",
                item
            );

            return "";
        }


        try {

            /*
             Encode a one-item collection.

             This is intentional. ContentContract accepts
             an array directly as a manifest.
            */

            return GlideContract.codec.encode(
                [minimalItem]
            );

        } catch (error) {

            console.error(
                "[ShareManager] Unable to encode selected item.",
                error
            );

            return "";
        }
    }


    /*
    =========================================================
     BASE SKYMEDIA URL
    =========================================================

     The current page may already contain:

       contractz
       contract
       books
       section
       id

     We deliberately discard ALL query parameters here.

     Why?

     The new share URL supplies its own minimal contract and
     its own section/id.

     Keeping the original contract would defeat the entire
     purpose of the shortened share link.
    =========================================================
    */

    function baseUrl() {

        const url =
            new URL(
                window.location.href
            );

        url.search = "";
        url.hash = "";

        return url.toString();
    }


    /*
    =========================================================
     BUILD SHORT SKYMEDIA SHARE URL
    =========================================================

     This is the key change from the previous implementation.

     OLD:

       copy the entire incoming contractz

     NEW:

       encode ONLY the currently selected item
    =========================================================
    */

    function buildUrl(section, id, item) {

        if (!section || !id) {
            return "";
        }


        /*
        -----------------------------------------------------
         If an item was supplied, create the minimal SR2
         contract from that item.
        -----------------------------------------------------
        */

        let contract = "";

        if (item) {

            contract =
                encodeSelectedItem(
                    item,
                    section
                );

        }


        /*
        -----------------------------------------------------
         A share URL without a contract would not be useful
         to a recipient who has no existing Glide payload.

         Do not silently create a broken link.
        -----------------------------------------------------
        */

        if (!contract) {

            console.error(
                "[ShareManager] Cannot create share URL: selected-item contract could not be encoded."
            );

            return "";
        }


        const url =
            new URL(
                baseUrl()
            );


        /*
        -----------------------------------------------------
         Add the NEW minimal contract.
        -----------------------------------------------------
        */

        url.searchParams.set(
            "contractz",
            contract
        );


        /*
        -----------------------------------------------------
         Add the exact application destination.
        -----------------------------------------------------
        */

        const normalizedSection =
            normalizeSection(
                section
            );

        url.searchParams.set(
            SECTION_PARAM,
            normalizedSection
        );

        url.searchParams.set(
            ID_PARAM,
            String(id)
        );


        return url.toString();
    }


    /*
    =========================================================
     SHARE
    =========================================================

     This function receives the item SkyReader is already
     displaying.

     Therefore SkyReader itself is the authority for which
     item is being shared.
    =========================================================
    */

    async function share(section, item) {

        if (
            !item ||
            !item.id
        ) {

            console.error(
                "[ShareManager] Share requested without a valid item.",
                item
            );

            return false;
        }


        const normalizedSection =
            normalizeSection(
                section
            );


        if (!normalizedSection) {

            console.error(
                "[ShareManager] Share requested without a valid section.",
                section
            );

            return false;
        }


        const url =
            buildUrl(
                normalizedSection,
                item.id,
                item
            );


        if (!url) {
            return false;
        }


        console.info(
            "[ShareManager] Short share link created:",
            {
                section: normalizedSection,
                id: item.id,
                url
            }
        );


        const data = {

            title:
                item.title ||
                "SkyMedia",

            text:
                item.title ||
                "",

            url
        };


        /*
        =====================================================
         NATIVE WEB SHARE
        =====================================================
        */

        try {

            if (
                navigator.share &&
                window.isSecureContext !== false
            ) {

                await navigator.share(
                    data
                );

                return true;
            }

        } catch (error) {

            /*
             User cancelled the native share dialog.
            */

            if (
                error &&
                error.name === "AbortError"
            ) {

                return false;
            }

            console.warn(
                "[ShareManager] Native share failed; trying clipboard.",
                error
            );
        }


        /*
        =====================================================
         CLIPBOARD FALLBACK
        =====================================================
        */

        try {

            await navigator.clipboard.writeText(
                url
            );

            announce(
                "Link copied to clipboard."
            );

            return true;

        } catch (error) {

            console.warn(
                "[ShareManager] Clipboard unavailable; using prompt.",
                error
            );


            /*
             Final browser fallback.
            */

            window.prompt(
                "Copy this link:",
                url
            );

            return false;
        }
    }


    /*
    =========================================================
     SHARE NOTIFICATION
    =========================================================
    */

    function announce(message) {

        let el =
            document.getElementById(
                "skyShareNotice"
            );


        if (!el) {

            el =
                document.createElement(
                    "div"
                );

            el.id =
                "skyShareNotice";

            el.setAttribute(
                "role",
                "status"
            );

            el.style.cssText =
                "position:fixed;" +
                "left:50%;" +
                "bottom:56px;" +
                "transform:translateX(-50%);" +
                "z-index:10000;" +
                "padding:8px 14px;" +
                "border-radius:8px;" +
                "background:rgba(0,0,0,.8);" +
                "color:#fff;" +
                "font-size:13px;" +
                "pointer-events:none;";

            document.body.appendChild(
                el
            );
        }


        el.textContent =
            message;


        clearTimeout(
            el._timer
        );


        el._timer =
            setTimeout(
                () => el.remove(),
                1800
            );
    }


    /*
    =========================================================
     READ DEEP-LINK TARGET
    =========================================================

     A short SkyMedia share link has:

       ?contractz=sr2....
       &section=slideshow
       &id=multiimagetest202609060819

     The contract contains the selected item.

     section/id explicitly identify which item to open.
    =========================================================
    */

    function readTarget() {

        const params =
            new URLSearchParams(
                window.location.search
            );


        const section =
            params.get(
                SECTION_PARAM
            );


        const id =
            params.get(
                ID_PARAM
            );


        return (
            section &&
            id
        )
            ? {

                section:
                    normalizeSection(
                        section
                    ),

                id:
                    id.trim()

            }
            : null;
    }


    /*
    =========================================================
     FIND ITEM IN MANIFEST
    =========================================================

     Manifest is the authoritative normalized collection.

     This is preferable to relying on a section library because
     the short share contract itself is now the complete source
     of truth for the recipient.
    =========================================================
    */

    function findManifestItem(target) {

        if (
            !target ||
            !target.id ||
            !window.Manifest
        ) {
            return null;
        }


        /*
        -----------------------------------------------------
         Convert application section to ContentContract type.
        -----------------------------------------------------
        */

        let type = "";

        if (
            target.section === "reader"
        ) {
            type = "book";
        }

        else if (
            target.section === "video"
        ) {
            type = "video";
        }

        else if (
            target.section === "slideshow"
        ) {
            type = "slideshow";
        }


        /*
        -----------------------------------------------------
         Prefer the type-specific Manifest collection.
        -----------------------------------------------------
        */

        if (
            type &&
            typeof Manifest.content ===
                "function"
        ) {

            const collection =
                Manifest.content(
                    type
                );

            if (
                Array.isArray(collection)
            ) {

                const item =
                    collection.find(
                        x =>
                            x &&
                            x.id === target.id
                    );

                if (item) {
                    return item;
                }
            }
        }


        /*
        -----------------------------------------------------
         Final fallback: search the complete Manifest.
        -----------------------------------------------------
        */

        if (
            typeof Manifest.all ===
                "function"
        ) {

            const all =
                Manifest.all();

            if (
                Array.isArray(all)
            ) {

                return (
                    all.find(
                        x =>
                            x &&
                            x.id === target.id
                    ) ||
                    null
                );
            }
        }


        return null;
    }


    /*
    =========================================================
     OPEN DEEP LINK
    =========================================================

     This opens the exact item identified by section/id.

     It does NOT send the user to:

       - Glide inventory
       - Glide detail screen
       - Front Page

     The selected item is opened directly inside SkyMedia.
    =========================================================
    */

    async function openDeepLink() {

        const target =
            readTarget();


        if (!target) {
            return false;
        }


        console.info(
            "[ShareManager] Deep-link target:",
            target
        );


        /*
        -----------------------------------------------------
         Find the exact normalized item.
        -----------------------------------------------------
        */

        const item =
            findManifestItem(
                target
            );


        if (!item) {

            console.warn(
                "[ShareManager] Deep-link target not found in Manifest:",
                target
            );

            return false;
        }


        /*
        =====================================================
         READER
        =====================================================
        */

        if (
            target.section === "reader"
        ) {

            if (
                !window.AppSwitcher
            ) {
                return false;
            }


            AppSwitcher.show(
                "reader"
            );


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


            console.warn(
                "[ShareManager] SRNavigation.openMagazine() unavailable."
            );

            return false;
        }


        /*
        =====================================================
         VIDEO
        =====================================================
        */

        if (
            target.section === "video"
        ) {

            if (
                !window.AppSwitcher
            ) {
                return false;
            }


            AppSwitcher.show(
                "video"
            );


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


            console.warn(
                "[ShareManager] VideoViewer.openVideo() unavailable."
            );

            return false;
        }


        /*
        =====================================================
         SLIDESHOW
        =====================================================
        */

        if (
            target.section === "slideshow"
        ) {

            if (
                !window.AppSwitcher
            ) {
                return false;
            }


            AppSwitcher.show(
                "slideshow"
            );


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


            console.warn(
                "[ShareManager] SlideshowViewer.open() unavailable."
            );

            return false;
        }


        /*
        =====================================================
         UNKNOWN SECTION
        =====================================================
        */

        console.warn(
            "[ShareManager] Unsupported deep-link section:",
            target.section
        );


        return false;
    }


    /*
    =========================================================
     PUBLIC API
    =========================================================
    */

    return {

        buildUrl,
        share,
        readTarget,
        openDeepLink

    };

})();
