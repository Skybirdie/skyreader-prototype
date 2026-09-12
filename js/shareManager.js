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

        const url =
            buildUrl(
                section,
                item.id
            );

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

     This runs AFTER the normal SkyMedia startup.

     Therefore Manifest has already loaded the Glide
     contract and all section libraries have already been
     populated.

     The deep link simply identifies which already-loaded
     item should be opened.
    ---------------------------------------------------------
    */

    async function openDeepLink() {

        const target =
            readTarget();

        if (!target) {
            return false;
        }

        if (!window.AppSwitcher) {
            return false;
        }


        /*
        -----------------------------------------------------
         VIDEO
        -----------------------------------------------------
        */

        if (
            target.section === "video" &&
            window.VideoLibrary
        ) {

            const videos =
                typeof VideoLibrary.getVideos ===
                    "function"

                    ? VideoLibrary.getVideos()

                    : [];

            const item =
                Array.isArray(videos)
                    ? videos.find(
                        x =>
                            x &&
                            x.id === target.id
                    )
                    : null;

            if (item) {

                AppSwitcher.show(
                    "video"
                );

                if (
                    window.VideoViewer &&
                    typeof VideoViewer.openVideo ===
                        "function"
                ) {

                    VideoViewer.openVideo(
                        item
                    );

                    return true;
                }
            }
        }


        /*
        -----------------------------------------------------
         SLIDESHOW
        -----------------------------------------------------
        */

        if (
            target.section === "slideshow" &&
            window.SlideshowLibrary
        ) {

            const slideshows =
                typeof SlideshowLibrary.getSlideshows ===
                    "function"

                    ? SlideshowLibrary.getSlideshows()

                    : [];

            const item =
                Array.isArray(slideshows)
                    ? slideshows.find(
                        x =>
                            x &&
                            x.id === target.id
                    )
                    : null;

            if (item) {

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
            }
        }


        /*
        -----------------------------------------------------
         READER
        -----------------------------------------------------
        */

        if (
            target.section === "reader" &&
            window.SkyReader
        ) {

            const books =
                Array.isArray(
                    SkyReader.library
                )
                    ? SkyReader.library
                    : [];

            const item =
                books.find(
                    x =>
                        x &&
                        x.id === target.id
                );

            if (
                item &&
                window.SRNavigation &&
                typeof SRNavigation.openMagazine ===
                    "function"
            ) {

                AppSwitcher.show(
                    "reader"
                );

                await SRNavigation.openMagazine(
                    item
                );

                return true;
            }
        }


        /*
        -----------------------------------------------------
         Target not found
        -----------------------------------------------------
        */

        console.warn(
            "[ShareManager] Deep-link target not found:",
            target
        );

        return false;
    }


    /*
    ---------------------------------------------------------
     Public API
    ---------------------------------------------------------
    */

    return {

        buildUrl,
        share,
        readTarget,
        openDeepLink

    };

})();