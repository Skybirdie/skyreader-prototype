"use strict";

window.ShareManager = (function () {

    const SECTION_PARAM = "section";
    const ID_PARAM = "id";

    /*
    ---------------------------------------------------------
     Contract parameters that must survive sharing
    ---------------------------------------------------------

     A Glide-generated SkyMedia URL contains the complete
     content collection in one of these query parameters.

     C2.2 / current:
         contractz

     Legacy compatibility:
         contract
         books

     The share link must preserve the contract because the
     recipient may not have the Glide-generated URL that the
     original viewer was opened with.
    ---------------------------------------------------------
    */

    const CONTRACT_PARAMS = [
        "contractz",
        "contract",
        "books"
    ];


    /*
    ---------------------------------------------------------
     Build the base URL for a share link
    ---------------------------------------------------------

     IMPORTANT:

     Do NOT erase the complete query string.

     Preserve the content contract while removing any
     existing section/id deep-link target. The new target
     will be added by buildUrl().
    ---------------------------------------------------------
    */

    function baseUrl() {

        const url =
            new URL(window.location.href);

        const preserved = new URLSearchParams();

        for (const name of CONTRACT_PARAMS) {

            const value =
                url.searchParams.get(name);

            if (
                value !== null &&
                value.trim() !== ""
            ) {
                preserved.set(
                    name,
                    value
                );
            }
        }

        url.search = preserved.toString();
        url.hash = "";

        return url.toString();
    }


    /*
    ---------------------------------------------------------
     Build a SkyMedia deep link
    ---------------------------------------------------------

     Result examples:

       ?contractz=sr2....&section=reader&id=book-001

       ?contractz=sr2....&section=video&id=video-001

       ?contractz=sr2....&section=slideshow&id=slide-001

     The contract remains intact.
    ---------------------------------------------------------
    */

    function buildUrl(section, id) {

        if (!section || !id) {
            return "";
        }

        const url =
            new URL(baseUrl());

        url.searchParams.set(
            SECTION_PARAM,
            section
        );

        url.searchParams.set(
            ID_PARAM,
            id
        );

        return url.toString();
    }


    /*
    ---------------------------------------------------------
     Build the public Glide viewer share URL
    ---------------------------------------------------------
    */
    function buildGlideShareUrl(section, id) {

        if (!section || !id) return "";

        const url = new URL(
            "https://meditationmornings.glide.page/dl/media"
        );

        url.searchParams.set(SECTION_PARAM, section);
        url.searchParams.set(ID_PARAM, id);

        return url.toString();
    }


    /*
    ---------------------------------------------------------
     Share
    ---------------------------------------------------------
    */

    async function share(section, item) {

        if (
            !item ||
            !item.id
        ) {
            return false;
        }

        /*
         Build the public Glide viewer URL. Do not use P3 inventory
         URLs here: the recipient must land on /dl/media, with the
         section and item id carried as query parameters.
        */
        const url = buildGlideShareUrl(section, item.id);

        if (!url) {
            return false;
        }

        const data = {
            title:
                item.title ||
                "SkyReader",

            text:
                item.title ||
                "",

            url
        };


        /*
        -----------------------------------------------------
         Native Web Share
        -----------------------------------------------------
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
        }


        /*
        -----------------------------------------------------
         Clipboard fallback
        -----------------------------------------------------
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

            /*
             Final fallback for browsers that do not
             provide clipboard access.
            */

            window.prompt(
                "Copy this link:",
                url
            );

            return false;
        }
    }


    /*
    ---------------------------------------------------------
     Small share notification
    ---------------------------------------------------------
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
    ---------------------------------------------------------
     Read deep-link target
    ---------------------------------------------------------
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
                section,
                id
            }
            : null;
    }


        /*
    ---------------------------------------------------------
     Open deep link
    ---------------------------------------------------------

     Deep-link parameters are:

         ?section=reader&id=BOOK_ID
         ?section=video&id=VIDEO_ID
         ?section=slideshow&id=SLIDESHOW_ID

     Manifest is the authoritative normalized content source.
     The deep link therefore does NOT depend on the individual
     section library having independently reconstructed the item.

     A valid deep link takes priority over the normal Front
     Page landing state.
    ---------------------------------------------------------
    */

    async function openDeepLink() {

        const target =
            readTarget();

        if (!target) {
            return false;
        }


        /*
        -----------------------------------------------------
         Normalize section names
        -----------------------------------------------------
        */

        const section =
            String(target.section)
                .trim()
                .toLowerCase();

        const id =
            String(target.id)
                .trim();


        if (!id) {
            return false;
        }


        /*
        -----------------------------------------------------
         Manifest must be available
        -----------------------------------------------------
        */

        if (
            !window.Manifest ||
            typeof Manifest.content !== "function"
        ) {

            console.warn(
                "[ShareManager] Manifest unavailable for deep link:",
                {
                    section,
                    id
                }
            );

            return false;
        }


        /*
        -----------------------------------------------------
         Convert routing name to Manifest content type
        -----------------------------------------------------

         Reader is the application name.
         Manifest calls that content type "book".
        */

        const manifestType =
            section === "reader"
                ? "book"
                : section;


        if (
            manifestType !== "book" &&
            manifestType !== "video" &&
            manifestType !== "slideshow"
        ) {

            console.warn(
                "[ShareManager] Unknown deep-link section:",
                section
            );

            return false;
        }


        /*
        -----------------------------------------------------
         Find the exact item in the unified Manifest
        -----------------------------------------------------
        */

        const collection =
            Manifest.content(
                manifestType
            );

        const item =
            Array.isArray(collection)
                ? collection.find(
                    entry =>
                        entry &&
                        String(entry.id) === id
                )
                : null;


        if (!item) {

            console.warn(
                "[ShareManager] Deep-link target not found in Manifest:",
                {
                    section,
                    id,
                    manifestType,
                    availableIds:
                        Array.isArray(collection)
                            ? collection.map(
                                entry => entry && entry.id
                            )
                            : []
                }
            );

            return false;
        }


        /*
        -----------------------------------------------------
         READER
        -----------------------------------------------------
        */

        if (manifestType === "book") {

            if (
                !window.AppSwitcher ||
                typeof AppSwitcher.show !== "function"
            ) {
                console.warn(
                    "[ShareManager] AppSwitcher unavailable for reader deep link."
                );

                return false;
            }

            if (
                !window.SRNavigation ||
                typeof SRNavigation.openMagazine !==
                    "function"
            ) {
                console.warn(
                    "[ShareManager] Reader navigation unavailable."
                );

                return false;
            }


            AppSwitcher.show(
                "reader"
            );

            await SRNavigation.openMagazine(
                item
            );

            return true;
        }


        /*
        -----------------------------------------------------
         VIDEO
        -----------------------------------------------------
        */

        if (manifestType === "video") {

            if (
                !window.AppSwitcher ||
                typeof AppSwitcher.show !== "function"
            ) {
                console.warn(
                    "[ShareManager] AppSwitcher unavailable for video deep link."
                );

                return false;
            }

            if (
                !window.VideoViewer ||
                typeof VideoViewer.openVideo !==
                    "function"
            ) {
                console.warn(
                    "[ShareManager] VideoViewer.openVideo unavailable."
                );

                return false;
            }


            AppSwitcher.show(
                "video"
            );

            VideoViewer.openVideo(
                item
            );

            return true;
        }


        /*
        -----------------------------------------------------
         SLIDESHOW
        -----------------------------------------------------
        */

        if (manifestType === "slideshow") {

            if (
                !window.AppSwitcher ||
                typeof AppSwitcher.show !== "function"
            ) {
                console.warn(
                    "[ShareManager] AppSwitcher unavailable for slideshow deep link."
                );

                return false;
            }

            if (
                !window.SlideshowViewer ||
                typeof SlideshowViewer.open !==
                    "function"
            ) {
                console.warn(
                    "[ShareManager] SlideshowViewer.open unavailable."
                );

                return false;
            }


            AppSwitcher.show(
                "slideshow"
            );

            await SlideshowViewer.open(
                item
            );

            return true;
        }


        return false;
    }


    /*
    ---------------------------------------------------------
     Public API
    ---------------------------------------------------------
    */

    return {

        buildUrl,
        buildGlideShareUrl,
        share,
        readTarget,
        openDeepLink

    };

})();