"use strict";

/*
=========================================================
 SkyMedia Share Viewer
 --------------------------------------------------------
 Share-mode shell for directly shared media.

 IMPORTANT:
 - Normal Reader controls are preserved.
 - Normal Reader button handlers are preserved.
 - Share Mode initializes SRNavigation against the
   shared Reader book after Reader.open().
 - No duplicate Reader navigation handlers are installed.
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
    let statusElement = null;
    let openButton = null;
    let closeButton = null;

    let bookControls = [];
    let bookControlState = [];

    const GLIDE_MEDIA_URL =
        "https://meditationmornings.glide.page/dl/media";


    /* --------------------------------------------------
       Utilities
    -------------------------------------------------- */

    function createElement(tag, className, text) {

        const el = document.createElement(tag);

        if (className) {
            el.className = className;
        }

        if (text !== undefined) {
            el.textContent = text;
        }

        return el;
    }


    function escapeText(value) {

        return String(value == null ? "" : value);
    }


    function getSectionLabel(section) {

        switch (String(section || "").toLowerCase()) {

            case "book":
                return "Book";

            case "video":
                return "Video";

            case "slideshow":
                return "Slideshow";

            default:
                return "Media";
        }
    }


    function findFirst(selectors) {

        for (const selector of selectors) {

            const el = document.querySelector(selector);

            if (el) {
                return el;
            }
        }

        return null;
    }


    /* --------------------------------------------------
       Share shell
    -------------------------------------------------- */

    function createShell() {

        if (shell) {
            return;
        }

        shell = createElement("section", "sky-share-shell");
        shell.id = "skyShareViewer";

        const header = createElement(
            "header",
            "sky-share-header"
        );

        titleElement = createElement(
            "div",
            "sky-share-title"
        );

        subtitleElement = createElement(
            "div",
            "sky-share-subtitle"
        );

        const titleWrap = createElement(
            "div",
            "sky-share-title-wrap"
        );

        titleWrap.appendChild(titleElement);
        titleWrap.appendChild(subtitleElement);

        header.appendChild(titleWrap);


        const main = createElement(
            "main",
            "sky-share-main"
        );

        mediaHost = createElement(
            "div",
            "sky-share-media-host"
        );

        mediaHost.id = "sky-share-media-host";

        statusElement = createElement(
            "div",
            "sky-share-status"
        );

        statusElement.id = "sky-share-status";

        main.appendChild(mediaHost);
        main.appendChild(statusElement);


        const actions = createElement(
            "div",
            "sky-share-actions"
        );

        openButton = createElement(
            "button",
            "sky-share-open-button",
            "Open in Meditation Mornings"
        );

        openButton.type = "button";

        openButton.addEventListener(
            "click",
            function () {

                window.location.href = GLIDE_MEDIA_URL;

            }
        );


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


        shell.appendChild(header);
        shell.appendChild(main);
        shell.appendChild(actions);

        document.body.appendChild(shell);
    }


    /* --------------------------------------------------
       Existing Reader controls
    -------------------------------------------------- */

    function collectBookControls() {

        const selectors = [

            "#toolbar",

            "#previousButton",
            "#nextButton",
            "#rotateButton",

            "#muteButton",

            "#readerShareButton",

            /*
             * This is the actual fullscreen control used
             * by the current Reader.
             */
            "#viewerFullscreenButton",

            "#readerCloseButton",

            "#statusBar",

            ".sr-welcome-banner"

        ];


        const result = [];
        const seen = new Set();


        for (const selector of selectors) {

            const nodes =
                document.querySelectorAll(selector);

            for (const node of nodes) {

                if (!seen.has(node)) {

                    seen.add(node);
                    result.push(node);

                }
            }
        }


        return result;
    }


    function exposeBookControls() {

        bookControls = collectBookControls();


        bookControlState =
            bookControls.map(function (el) {

                return {

                    element: el,

                    display: el.style.display,

                    visibility: el.style.visibility,

                    pointerEvents: el.style.pointerEvents,

                    zIndex: el.style.zIndex

                };

            });


        bookControls.forEach(function (el) {

            el.dataset.skyShareReaderControl = "true";

            /*
             * Do not replace the Reader's event handlers.
             */
            el.style.pointerEvents = "auto";


            if (
                el.id === "toolbar" ||
                el.id === "statusBar" ||
                el.classList.contains("sr-welcome-banner")
            ) {

                el.style.zIndex = "1000002";

            }

        });


        document.body.classList.add(
            "sky-share-book-controls-active"
        );


        console.log(
            "[ShareViewer] Reader controls exposed:",
            bookControls.map(function (el) {
                return el.id || el.className;
            })
        );
    }


    function restoreBookControls() {

        bookControlState.forEach(function (state) {

            const el = state.element;

            if (!el) {
                return;
            }


            el.style.display = state.display;
            el.style.visibility = state.visibility;
            el.style.pointerEvents = state.pointerEvents;
            el.style.zIndex = state.zIndex;


            delete el.dataset.skyShareReaderControl;

        });


        bookControlState = [];
        bookControls = [];


        document.body.classList.remove(
            "sky-share-book-controls-active"
        );
    }


    function verifyBookControls() {

        const ids = [

            "toolbar",

            "previousButton",
            "nextButton",
            "rotateButton",

            "muteButton",

            "readerShareButton",

            "viewerFullscreenButton",

            "readerCloseButton",

            "statusBar"

        ];


        const result = {};


        ids.forEach(function (id) {

            const el = document.getElementById(id);

            if (!el) {

                result[id] = null;
                return;

            }


            const rect =
                el.getBoundingClientRect();

            const style =
                window.getComputedStyle(el);


            result[id] = {

                display: style.display,

                visibility: style.visibility,

                pointerEvents: style.pointerEvents,

                zIndex: style.zIndex,

                width: rect.width,

                height: rect.height,

                left: rect.left,

                top: rect.top

            };

        });


        console.log(
            "[ShareViewer] Reader control state:",
            result
        );


        return result;
    }


    /* --------------------------------------------------
       Application isolation
    -------------------------------------------------- */

    function isolateApplication(section) {

        document.body.classList.add(
            "sky-share-mode"
        );


        const isBookShare =
            section === "book" ||
            section === "reader";


        const selectors = [

            "#frontPage",
            "#frontSection",

            "#videoSection",
            "#slideshowSection",

            "#librarySection",
            "#landingSection",

            "#appSwitcher",
            "#mainNav",
            "nav"

        ];


        /*
         * For books we deliberately leave #workspace
         * available because the Reader owns it.
         */
        if (!isBookShare) {

            selectors.push("#workspace");

        }


        selectors.forEach(function (selector) {

            document
                .querySelectorAll(selector)
                .forEach(function (el) {

                    if (
                        shell &&
                        shell.contains(el)
                    ) {
                        return;
                    }

                    el.classList.add(
                        "sky-share-hidden-app"
                    );

                });

        });


        if (isBookShare) {

            exposeBookControls();

        }
    }


    /* --------------------------------------------------
       Viewer relocation
    -------------------------------------------------- */

    function detachExistingViewer(viewer) {

        if (!viewer) {
            return;
        }


        /*
         * The Reader's actual viewer remains the same DOM
         * object. We are only changing its host.
         */
        mediaHost.appendChild(viewer);


        viewer.style.display = "";

        viewer.classList.add(
            "sky-share-mounted-viewer"
        );
    }


    /* --------------------------------------------------
       Reader / SRNavigation synchronization
    -------------------------------------------------- */

    function initializeShareReaderNavigation(item) {

        if (
            typeof window.SRNavigation === "undefined" ||
            !window.SRNavigation
        ) {

            console.warn(
                "[ShareViewer] SRNavigation is unavailable."
            );

            return false;
        }


        /*
         * SRNavigation.initialize() is intentionally safe
         * to call more than once; its own implementation
         * exits when already initialized.
         */
        try {

            if (
                typeof SRNavigation.initialized === "function" &&
                !SRNavigation.initialized()
            ) {

                SRNavigation.initialize();

                console.log(
                    "[ShareViewer] SRNavigation initialized."
                );
            }

        } catch (error) {

            console.error(
                "[ShareViewer] SRNavigation.initialize() failed:",
                error
            );

            return false;
        }


        /*
         * Reader.open() has already established the actual
         * current Reader book. Use that object whenever
         * possible so navigation points at the same object
         * Reader is using.
         */
        let book = null;


        try {

            if (
                typeof Reader.currentBook === "function"
            ) {

                book = Reader.currentBook();

            }

        } catch (error) {

            console.warn(
                "[ShareViewer] Could not read Reader.currentBook():",
                error
            );

        }


        if (!book) {
            book = item;
        }


        try {

            if (
                typeof SRNavigation.setCurrentBook ===
                "function"
            ) {

                SRNavigation.setCurrentBook(book);

            }

        } catch (error) {

            console.error(
                "[ShareViewer] SRNavigation.setCurrentBook() failed:",
                error
            );

            return false;
        }


        console.log(
            "[ShareViewer] Navigation synchronized:",
            SRNavigation.status()
        );


        return true;
    }


    /* --------------------------------------------------
       Book
    -------------------------------------------------- */

    async function prepareBook(item) {

        if (
            typeof window.Reader === "undefined" ||
            !Reader ||
            typeof Reader.open !== "function"
        ) {

            throw new Error(
                "Reader is unavailable."
            );

        }


        const viewerArea =
            document.getElementById("viewerArea");


        if (!viewerArea) {

            throw new Error(
                "#viewerArea was not found."
            );

        }


        /*
         * Move the existing Reader viewer into the Share
         * Viewer before opening the book.
         */
        detachExistingViewer(viewerArea);

        viewerArea.style.display = "";


        /*
         * Let the normal Reader open the book. Do not
         * replace Reader's own rendering/navigation logic.
         */
        await Reader.open(item);


        /*
         * This is the critical Share Mode fix.
         *
         * Reader is now open, so synchronize the separate
         * SRNavigation module with that Reader instance.
         */
        initializeShareReaderNavigation(item);


        /*
         * Reader.open() may create/show controls, so expose
         * them again after opening.
         */
        exposeBookControls();


        verifyBookControls();


        /*
         * Force the existing Reader viewer to recalculate
         * its available dimensions after being moved into
         * the Share Viewer host.
         */
        try {

            if (
                typeof Reader.refresh === "function"
            ) {

                requestAnimationFrame(function () {

                    try {
                        Reader.refresh();
                    } catch (error) {
                        console.warn(
                            "[ShareViewer] Reader.refresh() failed:",
                            error
                        );
                    }

                });

            }

        } catch (error) {

            console.warn(
                "[ShareViewer] Reader refresh setup failed:",
                error
            );

        }
    }


    /* --------------------------------------------------
       Video
    -------------------------------------------------- */

    async function prepareVideo(item) {

        if (
            typeof window.VideoViewer !== "undefined" &&
            VideoViewer &&
            typeof VideoViewer.open === "function"
        ) {

            await VideoViewer.open(item);
            return;
        }


        if (
            typeof window.VideoViewer !== "undefined" &&
            VideoViewer &&
            typeof VideoViewer.openVideo === "function"
        ) {

            await VideoViewer.openVideo(item);
            return;
        }


        throw new Error(
            "Video viewer is unavailable."
        );
    }


    /* --------------------------------------------------
       Slideshow
    -------------------------------------------------- */

    async function prepareSlideshow(item) {

        if (
            typeof window.SlideshowViewer !== "undefined" &&
            SlideshowViewer &&
            typeof SlideshowViewer.open === "function"
        ) {

            await SlideshowViewer.open(item);
            return;
        }


        if (
            typeof window.SlideshowViewer !== "undefined" &&
            SlideshowViewer &&
            typeof SlideshowViewer.openSlideshow === "function"
        ) {

            await SlideshowViewer.openSlideshow(item);
            return;
        }


        throw new Error(
            "Slideshow viewer is unavailable."
        );
    }


    /* --------------------------------------------------
       Open item
    -------------------------------------------------- */

    async function openItem(item, target) {

        activeItem = item;
        activeTarget = target;


        const section =
            String(
                target &&
                target.section ||
                item.type ||
                ""
            ).toLowerCase();


        titleElement.textContent =
            escapeText(item.title || "Shared Media");


        subtitleElement.textContent =
            escapeText(
                item.subtitle ||
                getSectionLabel(section)
            );


        statusElement.textContent =
            "Opening " +
            getSectionLabel(section).toLowerCase() +
            "…";


        try {

            switch (section) {

                case "book":
                case "reader":

                    await prepareBook(item);
                    break;


                case "video":

                    await prepareVideo(item);
                    break;


                case "slideshow":

                    await prepareSlideshow(item);
                    break;


                default:

                    throw new Error(
                        "Unsupported shared media type: " +
                        section
                    );
            }


            statusElement.textContent = "";

        } catch (error) {

            console.error(
                "[ShareViewer] Failed to open item:",
                error
            );


            statusElement.textContent =
                "Unable to open this item.";


            throw error;
        }
    }


    /* --------------------------------------------------
       Close
    -------------------------------------------------- */

    function close() {

        try {

            if (
                activeTarget &&
                String(activeTarget.section).toLowerCase() ===
                "video" &&
                typeof window.VideoViewer !== "undefined" &&
                VideoViewer
            ) {

                if (
                    typeof VideoViewer.closeVideo ===
                    "function"
                ) {

                    VideoViewer.closeVideo();

                } else if (
                    typeof VideoViewer.close ===
                    "function"
                ) {

                    VideoViewer.close();

                }

            }


            if (
                activeTarget &&
                String(activeTarget.section).toLowerCase() ===
                "slideshow" &&
                typeof window.SlideshowViewer !==
                "undefined" &&
                SlideshowViewer
            ) {

                if (
                    typeof SlideshowViewer.close ===
                    "function"
                ) {

                    SlideshowViewer.close();

                }

            }


            if (
                activeTarget &&
                (
                    String(activeTarget.section).toLowerCase() ===
                    "book" ||
                    String(activeTarget.section).toLowerCase() ===
                    "reader"
                ) &&
                typeof window.Reader !== "undefined" &&
                Reader &&
                typeof Reader.close === "function"
            ) {

                Reader.close({
                    playSound: false
                });

            }

        } catch (error) {

            console.warn(
                "[ShareViewer] Viewer close error:",
                error
            );

        }


        restoreBookControls();


        document.body.classList.remove(
            "sky-share-mode"
        );


        document
            .querySelectorAll(".sky-share-hidden-app")
            .forEach(function (el) {

                el.classList.remove(
                    "sky-share-hidden-app"
                );

            });


        if (shell) {

            shell.remove();
            shell = null;

        }


        started = false;
        activeItem = null;
        activeTarget = null;


        window.location.href =
            GLIDE_MEDIA_URL;
    }


    /* --------------------------------------------------
       Escape
    -------------------------------------------------- */

    function bindEscape() {

        document.addEventListener(
            "keydown",
            function onShareEscape(event) {

                if (
                    !started ||
                    event.key !== "Escape"
                ) {
                    return;
                }


                /*
                 * Do not close the Share Viewer if the normal
                 * Reader is currently in its own focus/fullscreen
                 * mode. Let the existing Reader control handle
                 * that first.
                 */
                if (
                    document
                        .getElementById("app")
                        ?.classList
                        .contains("viewerFocus")
                ) {

                    return;
                }


                close();

            },
            {
                once: true
            }
        );
    }


    /* --------------------------------------------------
       Public start
    -------------------------------------------------- */

    async function start(item, target) {

        if (started) {
            return;
        }


        if (!item) {

            console.error(
                "[ShareViewer] No item supplied."
            );

            return;
        }


        started = true;

        activeItem = item;
        activeTarget = target || {
            section: item.type
        };


        createShell();

        bindEscape();


        const section =
            String(
                activeTarget.section ||
                item.type ||
                ""
            ).toLowerCase();


        isolateApplication(section);


        try {

            await openItem(
                item,
                activeTarget
            );


            /*
             * Re-isolate after the viewer has opened because
             * Reader/Video/Slideshow may have changed visibility.
             */
            isolateApplication(section);


            if (
                section === "book" ||
                section === "reader"
            ) {

                exposeBookControls();

                verifyBookControls();

            }

        } catch (error) {

            console.error(
                "[ShareViewer] Share startup failed:",
                error
            );

            started = false;
        }
    }


    /* --------------------------------------------------
       Public API
    -------------------------------------------------- */

    return {

        start,

        close,

        isStarted: function () {
            return started;
        },

        getItem: function () {
            return activeItem;
        },

        getTarget: function () {
            return activeTarget;
        }

    };

})();