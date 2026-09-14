"use strict";

/*
=========================================================
 SkyMedia Share Viewer
 Version 1.0.0

 Standalone one-item viewer for social/share links.

 Responsibilities
 • Detect the requested section + item
 • Present exactly one item
 • Reuse existing SkyMedia rendering engines
 • Remove/hide normal application navigation
 • Provide a simple "Open Meditation Mornings" button
 • Keep normal SkyMedia application behavior untouched

 Share Mode intentionally does NOT expose:
 • Front Page
 • AppSwitcher
 • Libraries
 • Favorites
 • Bookmarks
 • Settings
 • Search
 • Normal section navigation
=========================================================
*/

window.ShareViewer = (function () {

    let started = false;
    let activeItem = null;
    let activeTarget = null;

    let shell = null;
    let titleElement = null;
    let subtitleElement = null;
    let mediaHost = null;
    let openButton = null;
    let closeButton = null;
    let statusElement = null;

    const GLIDE_MEDIA_URL =
        "https://meditationmornings.glide.page/dl/media";


    /*-------------------------------------------------------
      Utilities
    -------------------------------------------------------*/

    function createElement(tag, className, text) {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }


    function getSectionLabel(section) {

        switch (String(section || "").toLowerCase()) {

            case "reader":
            case "book":
                return "Book";

            case "video":
                return "Video";

            case "slideshow":
            case "slides":
                return "Images / Graphics";

            default:
                return "Media";
        }

    }


    function escapeText(value) {
        return String(value || "").trim();
    }


    /*-------------------------------------------------------
      Shell
    -------------------------------------------------------*/

    function createShell() {

        if (shell) {
            return;
        }

        shell = createElement(
            "div",
            "sky-share-shell"
        );

        shell.id = "skyShareShell";

        /*
         * Header
         */

        const header = createElement(
            "header",
            "sky-share-header"
        );

        const brand = createElement(
            "div",
            "sky-share-brand",
            "Meditation Mornings"
        );

        const section = createElement(
            "div",
            "sky-share-section"
        );

        header.appendChild(brand);
        header.appendChild(section);


        /*
         * Main
         */

        const main = createElement(
            "main",
            "sky-share-main"
        );

        const heading = createElement(
            "div",
            "sky-share-heading"
        );

        titleElement = createElement(
            "h1",
            "sky-share-title"
        );

        subtitleElement = createElement(
            "div",
            "sky-share-subtitle"
        );

        heading.appendChild(titleElement);
        heading.appendChild(subtitleElement);


        /*
         * Media host
         */

        mediaHost = createElement(
            "div",
            "sky-share-media-host"
        );

        statusElement = createElement(
            "div",
            "sky-share-status"
        );

        /*
         * Footer actions
         */

        const actions = createElement(
            "div",
            "sky-share-actions"
        );

        openButton = createElement(
            "a",
            "sky-share-open-button",
            "Open Meditation Mornings"
        );

        openButton.href = GLIDE_MEDIA_URL;
        openButton.target = "_blank";
        openButton.rel = "noopener noreferrer";

        closeButton = createElement(
            "button",
            "sky-share-close-button",
            "Close"
        );

        closeButton.type = "button";

        closeButton.addEventListener(
            "click",
            close
        );

        actions.appendChild(openButton);
        actions.appendChild(closeButton);


        main.appendChild(heading);
        main.appendChild(mediaHost);
        main.appendChild(statusElement);
        main.appendChild(actions);


        shell.appendChild(header);
        shell.appendChild(main);

        document.body.appendChild(shell);

        section.textContent = "";
        section.dataset.section = "";
    }


    /*-------------------------------------------------------
      Normal application shell isolation
    -------------------------------------------------------*/

    function isolateApplication() {

        document.body.classList.add("sky-share-mode");

        /*
         * Hide normal application sections/chrome.
         *
         * We deliberately do this with a class rather than deleting
         * elements. Existing Viewer/Renderer code can therefore still
         * use the DOM it was designed for.
         */

        const selectors = [

            "#frontPage",
            "#frontSection",

            "#videoTopBar",
            "#videoLibrary",
            "#videoSearchGroup",
            "#videoTopBarRightControls",

            "#slideshowLibrary",
            ".slideshow-top-bar",

            ".app-switcher",
            ".responsive-app-menu",

            "#readerLibrary",
            "#library",
            "#libraryPanel",

            "#settingsPanel",
            "#settingsOverlay",

            ".video-library",
            ".slideshow-library"

        ];

        selectors.forEach(selector => {

            document
                .querySelectorAll(selector)
                .forEach(element => {

                    element.dataset.skyShareHidden = "true";
                    element.style.display = "none";

                });

        });


        /*
         * Any existing Reader/Video/Slideshow section remains available
         * underneath the Share Viewer only when its rendering engine needs it.
         */

        document
            .querySelectorAll(
                "#frontPage, #frontSection"
            )
            .forEach(element => {
                element.style.display = "none";
            });


        /*
         * Disable ordinary navigation controls.
         */

        document
            .querySelectorAll(
                "[data-app-target], .app-switch-button, .responsive-app-menu-button"
            )
            .forEach(element => {

                element.dataset.skyShareHidden = "true";
                element.style.display = "none";

            });


        /*
         * Hide the normal welcome/release banners.
         */

        document
            .querySelectorAll(".sr-welcome-banner")
            .forEach(element => {

                element.dataset.skyShareHidden = "true";
                element.style.display = "none";

            });
    }


    /*-------------------------------------------------------
      Viewer mounting helpers
    -------------------------------------------------------*/

    function detachExistingViewer(viewer) {

        if (!viewer) {
            return;
        }

        /*
         * The actual rendering element remains in the document because
         * the existing engine depends on it.
         *
         * We visually move it into the Share Viewer host.
         */

        viewer.dataset.skyShareOriginalParent =
            viewer.parentElement ? viewer.parentElement.id || "" : "";

        viewer.dataset.skyShareOriginalDisplay =
            viewer.style.display || "";

        mediaHost.appendChild(viewer);

        viewer.style.display = "";
        viewer.classList.add("sky-share-mounted-viewer");
    }


    function prepareVideo(item) {

        /*
         * VideoLibrary is needed internally because VideoViewer.init()
         * expects its library dependency to exist. Its UI remains hidden.
         */

        if (
            window.VideoLibrary &&
            typeof VideoLibrary.init === "function"
        ) {
            VideoLibrary.init();

            if (
                typeof VideoLibrary.load === "function" &&
                window.Manifest &&
                typeof Manifest.videos === "function"
            ) {
                VideoLibrary.load(
                    Manifest.videos()
                );
            }
        }


        const viewer =
            document.getElementById("videoViewer");

        if (!viewer) {
            throw new Error(
                "Share Mode: #videoViewer not found."
            );
        }


        /*
         * VideoViewer can use its normal DOM safely.
         */

        if (
            window.VideoViewer &&
            typeof VideoViewer.init === "function"
        ) {
            VideoViewer.init();
        }


        detachExistingViewer(viewer);


        /*
         * Open the exact shared item.
         */

        if (
            !window.VideoViewer ||
            typeof VideoViewer.openVideo !== "function"
        ) {
            throw new Error(
                "Share Mode: VideoViewer.openVideo() unavailable."
            );
        }

        return VideoViewer.openVideo(item);
    }


    async function prepareSlideshow(item) {

        /*
         * SlideshowViewer expects its normal DOM IDs, so we initialize
         * the existing viewer and then mount that viewer into Share Mode.
         *
         * The library itself remains hidden.
         */

        if (
            window.SlideshowLibrary &&
            typeof SlideshowLibrary.init === "function"
        ) {
            SlideshowLibrary.init();

            if (
                typeof SlideshowLibrary.load === "function" &&
                window.Manifest &&
                typeof Manifest.slideshows === "function"
            ) {
                SlideshowLibrary.load(
                    Manifest.slideshows()
                );
            }
        }


        if (
            !window.SlideshowViewer ||
            typeof SlideshowViewer.init !== "function"
        ) {
            throw new Error(
                "Share Mode: SlideshowViewer unavailable."
            );
        }


        const viewer =
            document.getElementById("slideshowViewer");

        if (!viewer) {
            throw new Error(
                "Share Mode: #slideshowViewer not found."
            );
        }


        /*
         * SlideshowViewer.init() must see its expected IDs before the
         * viewer is moved.
         */

        SlideshowViewer.init();

        detachExistingViewer(viewer);


        /*
         * Open only the requested item.
         */

        await SlideshowViewer.open(item);
    }


    async function prepareBook(item) {

        /*
         * Reader/Renderer already initialize automatically from
         * DOMContentLoaded. We therefore reuse the existing Reader
         * engine rather than creating another PDF renderer.
         */

        if (
            !window.Reader ||
            typeof Reader.open !== "function"
        ) {
            throw new Error(
                "Share Mode: Reader.open() unavailable."
            );
        }


        const viewerArea =
            document.getElementById("viewerArea");

        if (!viewerArea) {
            throw new Error(
                "Share Mode: #viewerArea not found."
            );
        }


        /*
         * Move the actual Reader viewer into Share Mode.
         *
         * Renderer continues to use #viewerArea and #pageContainer,
         * so no engine changes are necessary.
         */

        detachExistingViewer(viewerArea);


        /*
         * The Reader's normal surrounding chrome is hidden by Share Mode.
         */

        viewerArea.style.display = "";


        /*
         * Open the exact shared book.
         */

        await Reader.open(item);
    }


    /*-------------------------------------------------------
      Media type dispatch
    -------------------------------------------------------*/

    async function openItem(item, target) {

        const section =
            String(target.section || item.type || "")
                .toLowerCase();

        activeItem = item;
        activeTarget = target;


        titleElement.textContent =
            escapeText(item.title) || "Meditation Mornings";

        subtitleElement.textContent =
            escapeText(item.subtitle);

        document
            .querySelector(".sky-share-section")
            ?.setAttribute(
                "data-section",
                section
            );

        document
            .querySelector(".sky-share-section")
            ?.replaceChildren(
                document.createTextNode(
                    getSectionLabel(section)
                )
            );


        statusElement.textContent =
            "Opening " +
            getSectionLabel(section).toLowerCase() +
            "…";


        try {

            if (
                section === "video"
            ) {

                await prepareVideo(item);

            }
            else if (
                section === "slideshow" ||
                section === "slides"
            ) {

                await prepareSlideshow(item);

            }
            else if (
                section === "reader" ||
                section === "book"
            ) {

                await prepareBook(item);

            }
            else {

                throw new Error(
                    "Unsupported Share Mode section: " +
                    section
                );

            }


            statusElement.textContent = "";


        } catch (error) {

            console.error(
                "[SkyMedia] Share Mode media open failed.",
                error
            );

            statusElement.textContent =
                "Unable to open this item.";

            throw error;
        }
    }


    /*-------------------------------------------------------
      Close
    -------------------------------------------------------*/

    function close() {

        try {

            if (
                activeTarget &&
                (
                    activeTarget.section === "video" ||
                    activeItem?.type === "video"
                ) &&
                window.VideoViewer &&
                typeof VideoViewer.closeVideo === "function"
            ) {
                VideoViewer.closeVideo();
            }


            if (
                activeTarget &&
                (
                    activeTarget.section === "slideshow" ||
                    activeItem?.type === "slideshow"
                ) &&
                window.SlideshowViewer &&
                typeof SlideshowViewer.close === "function"
            ) {
                SlideshowViewer.close();
            }


            if (
                activeTarget &&
                (
                    activeTarget.section === "reader" ||
                    activeTarget.section === "book" ||
                    activeItem?.type === "book"
                ) &&
                window.Reader &&
                typeof Reader.close === "function" &&
                Reader.isOpen()
            ) {
                Reader.close({
                    playSound: false
                });
            }

        } catch (error) {

            console.warn(
                "[SkyMedia] Share Mode close cleanup failed.",
                error
            );

        }


        /*
         * Return to the normal SkyMedia URL rather than trying to
         * reconstruct application state.
         */

        window.location.href =
                "https://meditationmornings.glide.page/dl/media";
    }


    /*-------------------------------------------------------
      Escape key
    -------------------------------------------------------*/

    function bindEscape() {

        document.addEventListener(
            "keydown",
            event => {

                if (!document.body.classList.contains("sky-share-mode")) {
                    return;
                }

                if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                }

            }
        );

    }


    /*-------------------------------------------------------
      Start
    -------------------------------------------------------*/

    async function start(item, target) {

    if (started) {
        return;
    }

    console.log("[SkyMedia Share] start() entered.");

    if (!item) {
        console.error("[SkyMedia Share] No item supplied.");
        throw new Error(
            "Share Mode: no item supplied."
        );
    }

    if (!target) {
        console.error("[SkyMedia Share] No target supplied.");
        throw new Error(
            "Share Mode: no target supplied."
        );
    }

    console.log(
        "[SkyMedia Share] Target:",
        target.section,
        target.id
    );

    console.log(
        "[SkyMedia Share] Item:",
        item
    );

    started = true;

    try {

        console.log("[SkyMedia Share] Creating shell.");

        createShell();

        console.log("[SkyMedia Share] Binding Escape.");

        bindEscape();

        console.log("[SkyMedia Share] Opening item.");

        await openItem(item, target);

        console.log("[SkyMedia Share] Item opened successfully.");

        /*
         * Only hide the normal application chrome AFTER
         * the requested viewer has successfully opened.
         *
         * This prevents Share Mode from hiding the viewer
         * while it is still initializing.
         */

        isolateApplication();

        console.log("[SkyMedia Share] Application isolated.");

    } catch (error) {

        console.error(
            "[SkyMedia Share] STARTUP FAILED:",
            error
        );

        started = false;

        throw error;
    }

}


    /*-------------------------------------------------------
      Public API
    -------------------------------------------------------*/

    return {

        start,
        close,

        isStarted() {
            return started;
        },

        getItem() {
            return activeItem;
        },

        getTarget() {
            return activeTarget;
        }

    };

})();