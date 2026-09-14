"use strict";

/*
=========================================================
 SkyMedia Share Viewer
 Version 1.2.0

 Standalone one-item viewer for social/share links.

 Share Mode:
 • Opens exactly one requested item
 • Reuses existing SkyMedia rendering engines
 • Retains the normal viewer background
 • Retains normal viewer controls
 • Hides libraries and application navigation
 • Provides "Open Meditation Mornings"
 • Escape / Close returns to Meditation Mornings Glide

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
         * Footer
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


        const section =
            shell.querySelector(
                ".sky-share-section"
            );

        if (section) {

            section.textContent = "";

            section.dataset.section = "";

        }

    }


    /*-------------------------------------------------------
      Normal application isolation
    -------------------------------------------------------*/

    function isolateApplication() {

        document.body.classList.add(
            "sky-share-mode"
        );


        /*
         * Hide only application navigation.
         *
         * IMPORTANT:
         *
         * We do NOT hide viewer controls here.
         */

        const selectors = [

            "#frontPage",
            "#frontSection",

            ".app-switcher",
            ".responsive-app-menu",
            ".responsive-app-menu-button",

            "#settingsPanel",
            "#settingsOverlay",

            ".sr-welcome-banner"

        ];


        selectors.forEach(selector => {

            document
                .querySelectorAll(selector)
                .forEach(element => {

                    element.dataset.skyShareHidden =
                        "true";

                    element.style.display =
                        "none";

                });

        });


        /*
         * Hide ordinary application navigation buttons.
         */

        document
            .querySelectorAll(
                "[data-app-target], .app-switch-button"
            )
            .forEach(element => {

                element.dataset.skyShareHidden =
                    "true";

                element.style.display =
                    "none";

            });

    }


    /*-------------------------------------------------------
      Mount existing viewer
    -------------------------------------------------------*/

    function mountViewer(viewer) {

        if (!viewer) {
            return;
        }


        /*
         * Preserve the actual existing viewer.
         *
         * The viewer itself is moved into the Share media host.
         *
         * Its internal controls, background and rendering engine
         * remain intact.
         */

        viewer.dataset.skyShareOriginalParent =
            viewer.parentElement
                ? viewer.parentElement.id || ""
                : "";

        viewer.dataset.skyShareOriginalDisplay =
            viewer.style.display || "";


        mediaHost.appendChild(viewer);


        viewer.style.display = "";

        viewer.classList.add(
            "sky-share-mounted-viewer"
        );

    }


    /*-------------------------------------------------------
      Hide libraries
    -------------------------------------------------------*/

    function hideLibraries() {

        const selectors = [

            "#videoLibrary",
            ".video-library",

            "#slideshowLibrary",
            ".slideshow-library",

            "#readerLibrary",
            "#library",
            "#libraryPanel",
            ".reader-library",
            ".reader-library-panel"

        ];


        selectors.forEach(selector => {

            document
                .querySelectorAll(selector)
                .forEach(element => {

                    element.dataset.skyShareHidden =
                        "true";

                    element.style.display =
                        "none";

                });

        });

    }


    /*-------------------------------------------------------
      Video
    -------------------------------------------------------*/

    async function prepareVideo(item) {

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
            document.getElementById(
                "videoViewer"
            );


        if (!viewer) {

            throw new Error(
                "Share Mode: #videoViewer not found."
            );

        }


        if (
            window.VideoViewer &&
            typeof VideoViewer.init === "function"
        ) {

            VideoViewer.init();

        }


        /*
         * Open the exact item BEFORE mounting.
         *
         * This allows VideoViewer to perform all of its normal
         * initialization against its expected DOM.
         */

        if (
            !window.VideoViewer ||
            typeof VideoViewer.openVideo !== "function"
        ) {

            throw new Error(
                "Share Mode: VideoViewer.openVideo() unavailable."
            );

        }


        await VideoViewer.openVideo(item);


        /*
         * Now mount the already-initialized viewer.
         */

        mountViewer(viewer);

    }


    /*-------------------------------------------------------
      Slideshow
    -------------------------------------------------------*/

    async function prepareSlideshow(item) {

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
            document.getElementById(
                "slideshowViewer"
            );


        if (!viewer) {

            throw new Error(
                "Share Mode: #slideshowViewer not found."
            );

        }


        /*
         * Initialize while the viewer still has its normal DOM
         * relationships.
         */

        SlideshowViewer.init();


        await SlideshowViewer.open(item);


        /*
         * Mount only after the slideshow is successfully open.
         */

        mountViewer(viewer);

    }


    /*-------------------------------------------------------
      Reader
    -------------------------------------------------------*/

    async function prepareBook(item) {

        if (
            !window.Reader ||
            typeof Reader.open !== "function"
        ) {

            throw new Error(
                "Share Mode: Reader.open() unavailable."
            );

        }


        const viewerArea =
            document.getElementById(
                "viewerArea"
            );


        if (!viewerArea) {

            throw new Error(
                "Share Mode: #viewerArea not found."
            );

        }


        /*
         * Open the book while Renderer still has the exact
         * DOM structure it expects.
         */

        await Reader.open(item);


        /*
         * Mount the complete Reader viewer after opening.
         *
         * #pageContainer remains inside #viewerArea.
         */

        mountViewer(viewerArea);

    }


    /*-------------------------------------------------------
      Open item
    -------------------------------------------------------*/

    async function openItem(item, target) {

        const section =
            String(
                target.section ||
                item.type ||
                ""
            ).toLowerCase();


        activeItem = item;
        activeTarget = target;


        titleElement.textContent =
            escapeText(item.title) ||
            "Meditation Mornings";


        subtitleElement.textContent =
            escapeText(item.subtitle);


        const sectionElement =
            shell.querySelector(
                ".sky-share-section"
            );


        if (sectionElement) {

            sectionElement.setAttribute(
                "data-section",
                section
            );

            sectionElement.textContent =
                getSectionLabel(section);

        }


        statusElement.textContent =
            "Opening " +
            getSectionLabel(section).toLowerCase() +
            "…";


        try {

            if (section === "video") {

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


            /*
             * Hide libraries only after the viewer has opened.
             */

            hideLibraries();

            isolateApplication();


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
         * Return directly to the actual Meditation Mornings
         * application.
         */

        window.location.href =
            GLIDE_MEDIA_URL;

    }


    /*-------------------------------------------------------
      Escape
    -------------------------------------------------------*/

    function bindEscape() {

        document.addEventListener(
            "keydown",
            event => {

                if (
                    !document.body.classList.contains(
                        "sky-share-mode"
                    )
                ) {
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


        if (!item) {

            throw new Error(
                "Share Mode: no item supplied."
            );

        }


        if (!target) {

            throw new Error(
                "Share Mode: no target supplied."
            );

        }


        started = true;


        createShell();

        bindEscape();


        try {

            await openItem(
                item,
                target
            );

        } catch (error) {

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
