"use strict";

/*
=========================================================
 SkyMedia Share Viewer
 --------------------------------------------------------
 Standalone Share-mode shell for directly shared media.

 SHARE READER RULES
 --------------------------------------------------------
 - Normal Reader engine is preserved.
 - Normal Reader rendering is preserved.
 - Share Mode supplies missing control wiring.
 - Previous / Next use SRNavigation.
 - Rotate / Mute / Share are explicitly wired.
 - Fullscreen uses REAL browser fullscreen.
 - Reader controls remain visible while fullscreen.
 - Mouse wheel turns pages.
 - Last page does NOT return to the landing page.
 - X closes the shared document without redirecting.
 - The large decorated navigation button can later
   navigate back to the Glide application.
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

    /*
     * Event listeners installed specifically by ShareViewer.
     * They are removed when Share Mode closes.
     */
    let shareReaderHandlers = [];


    /*
     * Prevents wheel events from causing multiple page turns
     * while the current page turn is still settling.
     */
    let wheelBusy = false;


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


    /* --------------------------------------------------
       Share shell
    -------------------------------------------------- */

    function createShell() {

        if (shell) {
            return;
        }


        shell = createElement(
            "section",
            "sky-share-shell"
        );

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

        mediaHost.id =
            "sky-share-media-host";


        statusElement = createElement(
            "div",
            "sky-share-status"
        );

        statusElement.id =
            "sky-share-status";


        main.appendChild(mediaHost);
        main.appendChild(statusElement);


        const actions = createElement(
            "div",
            "sky-share-actions"
        );


        /*
         * This button is intentionally retained.
         *
         * It is the future large decorated navigation
         * button requested by the user.
         *
         * For now it continues to navigate to Glide.
         */
        openButton = createElement(
            "button",
            "sky-share-open-button",
            "Open in Meditation Mornings"
        );

        openButton.type = "button";


        openButton.addEventListener(
            "click",
            function () {

                window.location.href =
                    GLIDE_MEDIA_URL;

            }
        );


        /*
         * X / Close:
         *
         * IMPORTANT:
         * This no longer navigates to Glide.
         *
         * It simply closes the shared document.
         */
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

            "#viewerFullscreenButton",

            "#readerCloseButton",

            "#statusBar",

            ".sr-welcome-banner"

        ];


        const result = [];
        const seen = new Set();


        selectors.forEach(function (selector) {

            document
                .querySelectorAll(selector)
                .forEach(function (node) {

                    if (!seen.has(node)) {

                        seen.add(node);
                        result.push(node);

                    }

                });

        });


        return result;
    }


    function exposeBookControls() {

        const newlyCollected =
            collectBookControls();


        /*
         * Save the ORIGINAL state only once.
         */
        if (!bookControlState.length) {

            bookControls =
                newlyCollected;


            bookControlState =
                bookControls.map(function (el) {

                    return {

                        element: el,

                        display:
                            el.style.display,

                        visibility:
                            el.style.visibility,

                        pointerEvents:
                            el.style.pointerEvents,

                        zIndex:
                            el.style.zIndex

                    };

                });

        } else {

            bookControls =
                newlyCollected;

        }


        bookControls.forEach(function (el) {

            el.dataset.skyShareReaderControl =
                "true";


            el.style.pointerEvents =
                "auto";


            if (
                el.id === "toolbar" ||
                el.id === "statusBar" ||
                el.classList.contains(
                    "sr-welcome-banner"
                )
            ) {

                el.style.zIndex =
                    "1000002";

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


            el.style.display =
                state.display;

            el.style.visibility =
                state.visibility;

            el.style.pointerEvents =
                state.pointerEvents;

            el.style.zIndex =
                state.zIndex;


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

            const el =
                document.getElementById(id);


            if (!el) {

                result[id] = null;
                return;

            }


            const rect =
                el.getBoundingClientRect();


            const style =
                window.getComputedStyle(el);


            result[id] = {

                display:
                    style.display,

                visibility:
                    style.visibility,

                pointerEvents:
                    style.pointerEvents,

                zIndex:
                    style.zIndex,

                width:
                    rect.width,

                height:
                    rect.height,

                left:
                    rect.left,

                top:
                    rect.top

            };

        });


        console.log(
            "[ShareViewer] Reader control state:",
            result
        );


        return result;
    }


    /* --------------------------------------------------
       Share-specific event management
    -------------------------------------------------- */

    function removeShareReaderHandlers() {

        shareReaderHandlers.forEach(
            function (entry) {

                try {

                    entry.element.removeEventListener(
                        entry.type,
                        entry.handler,
                        entry.options
                    );

                } catch (error) {

                    console.warn(
                        "[ShareViewer] Could not remove handler:",
                        error
                    );

                }

            }
        );


        shareReaderHandlers = [];
    }


    function addShareReaderHandler(
        element,
        type,
        handler,
        options
    ) {

        if (!element) {
            return;
        }


        element.addEventListener(
            type,
            handler,
            options
        );


        shareReaderHandlers.push({

            element: element,
            type: type,
            handler: handler,
            options: options

        });

    }


    /* --------------------------------------------------
       Reader action helpers
    -------------------------------------------------- */

    function resetTurnBookmark() {

        try {

            if (
                typeof window.resetBookmarkFlagForTurn ===
                "function"
            ) {

                window.resetBookmarkFlagForTurn();

            }

        } catch (error) {

            console.warn(
                "[ShareViewer] Bookmark reset failed:",
                error
            );

        }

    }


    function readerNext() {

        if (
            !window.Reader ||
            typeof Reader.currentPage !== "function" ||
            typeof Reader.pages !== "function"
        ) {

            return false;

        }


        const current =
            Number(Reader.currentPage());


        const total =
            Number(Reader.pages());


        /*
         * CRITICAL STANDALONE-SHARE RULE:
         *
         * Never allow Share Mode to invoke the normal
         * Reader "last page" action.
         *
         * The normal Reader uses the last-page event to
         * return to the landing/library experience.
         */
        if (
            Number.isFinite(current) &&
            Number.isFinite(total) &&
            current >= total
        ) {

            console.log(
                "[ShareViewer] Last page reached; Next disabled."
            );


            return false;

        }


        resetTurnBookmark();


        if (
            window.SRNavigation &&
            typeof SRNavigation.next ===
            "function"
        ) {

            return SRNavigation.next();

        }


        if (
            typeof Reader.next ===
            "function"
        ) {

            return Reader.next();

        }


        return false;
    }


    function readerPrevious() {

        resetTurnBookmark();


        if (
            window.SRNavigation &&
            typeof SRNavigation.previous ===
            "function"
        ) {

            return SRNavigation.previous();

        }


        if (
            window.Reader &&
            typeof Reader.previous ===
            "function"
        ) {

            return Reader.previous();

        }


        return false;
    }


    /* --------------------------------------------------
       Fullscreen
    -------------------------------------------------- */

    async function enterShareFullscreen() {

    /*
     * Share Mode needs the ENTIRE Share Viewer shell
     * to become the browser fullscreen element.
     *
     * This keeps:
     *   - the actual book
     *   - Reader toolbar
     *   - Reader controls
     *   - Share Viewer layout
     *
     * together in fullscreen.
     *
     * Do NOT fullscreen #viewerBackground because in the
     * current Reader layout that element is the background
     * layer rather than the complete Reader surface.
     */

    const target =
        document.getElementById("skyShareViewer") ||
        document.getElementById("sky-share-media-host") ||
        document.getElementById("viewerArea");


    if (!target) {

        console.warn(
            "[ShareViewer] No Share fullscreen target found."
        );

        return;

    }


    try {

        /*
         * Already fullscreen → exit fullscreen.
         */
        if (document.fullscreenElement) {

            if (
                typeof document.exitFullscreen ===
                "function"
            ) {

                await document.exitFullscreen();

            }

            return;
        }


        if (
            typeof target.requestFullscreen ===
            "function"
        ) {

            await target.requestFullscreen();

            return;

        }


        if (
            typeof target.webkitRequestFullscreen ===
            "function"
        ) {

            target.webkitRequestFullscreen();

            return;

        }


        console.warn(
            "[ShareViewer] Browser fullscreen API unavailable."
        );


    } catch (error) {

        console.warn(
            "[ShareViewer] Fullscreen request failed:",
            error
        );

    }
}


    /* --------------------------------------------------
       Rotate
    -------------------------------------------------- */

    function performRotate() {

        /*
         * The normal Reader has historically owned the
         * rotate behavior. Try the known application-level
         * function first.
         */
        const candidates = [

            "rotateViewer",

            "rotateReader",

            "rotatePage",

            "toggleRotation",

            "toggleReaderRotation"

        ];


        for (const name of candidates) {

            if (
                typeof window[name] ===
                "function"
            ) {

                console.log(
                    "[ShareViewer] Rotate →",
                    name
                );


                try {

                    return window[name]();

                } catch (error) {

                    console.warn(
                        "[ShareViewer] Rotate function failed:",
                        name,
                        error
                    );

                }

            }

        }


        /*
         * If the Reader exposes rotation through Renderer,
         * use that without modifying the engine.
         */
        if (
            window.Renderer &&
            typeof Renderer.rotate ===
            "function"
        ) {

            console.log(
                "[ShareViewer] Rotate → Renderer.rotate()"
            );


            return Renderer.rotate();

        }


        console.warn(
            "[ShareViewer] No Reader rotate function was exposed."
        );


        return false;
    }


    /* --------------------------------------------------
       Mute
    -------------------------------------------------- */

    function performMute() {

        const candidates = [

            "toggleMute",

            "toggleReaderMute",

            "toggleAudioMute",

            "toggleSoundMute"

        ];


        for (const name of candidates) {

            if (
                typeof window[name] ===
                "function"
            ) {

                console.log(
                    "[ShareViewer] Mute →",
                    name
                );


                try {

                    return window[name]();

                } catch (error) {

                    console.warn(
                        "[ShareViewer] Mute function failed:",
                        name,
                        error
                    );

                }

            }

        }


        /*
         * Try the application's AudioController if it
         * exposes a mute/toggle method.
         */
        if (
            window.AudioController
        ) {

            const audioCandidates = [

                "toggleMute",
                "muteToggle",
                "setMuted"

            ];


            for (
                const name of audioCandidates
            ) {

                if (
                    typeof AudioController[name] ===
                    "function"
                ) {

                    console.log(
                        "[ShareViewer] Mute → AudioController." +
                        name
                    );


                    try {

                        return AudioController[name]();

                    } catch (error) {

                        console.warn(
                            "[ShareViewer] AudioController mute failed:",
                            error
                        );

                    }

                }

            }

        }


        console.warn(
            "[ShareViewer] No Reader mute function was exposed."
        );


        return false;
    }


    /* --------------------------------------------------
       Share link
    -------------------------------------------------- */

    async function performShare() {

        /*
         * First use the browser's native Web Share API
         * when available.
         *
         * This gives a true standalone Share action and
         * does not require changing the application's
         * share-link generation.
         */
        const url =
            window.location.href;


        const title =
            activeItem &&
            activeItem.title
                ? String(activeItem.title)
                : document.title;


        if (
            navigator.share
        ) {

            try {

                await navigator.share({

                    title: title,

                    text: title,

                    url: url

                });


                return true;

            } catch (error) {

                /*
                 * User cancellation is normal and should
                 * not be treated as an application error.
                 */
                if (
                    error &&
                    error.name ===
                    "AbortError"
                ) {

                    return false;

                }


                console.warn(
                    "[ShareViewer] Native share failed:",
                    error
                );

            }

        }


        /*
         * Clipboard fallback.
         */
        try {

            if (
                navigator.clipboard &&
                typeof navigator.clipboard.writeText ===
                "function"
            ) {

                await navigator.clipboard.writeText(
                    url
                );


                statusElement.textContent =
                    "Share link copied.";


                setTimeout(
                    function () {

                        if (
                            statusElement &&
                            started
                        ) {

                            statusElement.textContent =
                                "";

                        }

                    },
                    1800
                );


                return true;

            }

        } catch (error) {

            console.warn(
                "[ShareViewer] Clipboard share failed:",
                error
            );

        }


        /*
         * Final fallback.
         */
        try {

            window.prompt(
                "Copy this share link:",
                url
            );


            return true;

        } catch (error) {

            console.warn(
                "[ShareViewer] Share fallback failed:",
                error
            );

        }


        return false;
    }


    /* --------------------------------------------------
       Mouse wheel navigation
    -------------------------------------------------- */

    function handleShareWheel(event) {

        if (!started) {
            return;
        }


        /*
         * Only act when a book is actually open.
         */
        if (
            !window.Reader ||
            typeof Reader.isOpen !==
            "function" ||
            !Reader.isOpen()
        ) {

            return;
        }


        /*
         * Ignore horizontal wheel gestures.
         */
        if (
            Math.abs(event.deltaX) >
            Math.abs(event.deltaY)
        ) {

            return;

        }


        /*
         * Ignore tiny trackpad noise.
         */
        if (
            Math.abs(event.deltaY) <
            12
        ) {

            return;

        }


        /*
         * Do not allow the normal page/container wheel
         * behavior to bubble into another application.
         */
        event.preventDefault();


        if (wheelBusy) {
            return;
        }


        wheelBusy = true;


        const direction =
            event.deltaY > 0
                ? "next"
                : "previous";


        const result =
            direction === "next"
                ? readerNext()
                : readerPrevious();


        /*
         * PageFlip animations need a short settling
         * interval before accepting another wheel turn.
         */
        Promise.resolve(result)
            .catch(function (error) {

                console.warn(
                    "[ShareViewer] Wheel navigation failed:",
                    error
                );

            })
            .finally(function () {

                setTimeout(
                    function () {

                        wheelBusy = false;

                    },
                    450
                );

            });

    }


    function attachShareWheelNavigation() {

        const viewer =
            document.getElementById(
                "viewerArea"
            );


        if (!viewer) {

            console.warn(
                "[ShareViewer] #viewerArea unavailable for wheel navigation."
            );


            return;

        }


        /*
         * Capture phase ensures Share Mode receives the
         * wheel event before another application handler
         * can consume it.
         */
        addShareReaderHandler(
            viewer,
            "wheel",
            handleShareWheel,
            {
                passive: false,
                capture: true
            }
        );


        console.log(
            "[ShareViewer] Share wheel navigation attached."
        );

    }


    /* --------------------------------------------------
       Wire Share Reader controls
    -------------------------------------------------- */

    function wireShareReaderControls() {

        removeShareReaderHandlers();


        const previousButton =
            document.getElementById(
                "previousButton"
            );


        const nextButton =
            document.getElementById(
                "nextButton"
            );


        const rotateButton =
            document.getElementById(
                "rotateButton"
            );


        const muteButton =
            document.getElementById(
                "muteButton"
            );


        const shareButton =
            document.getElementById(
                "readerShareButton"
            );


        const fullscreenButton =
            document.getElementById(
                "viewerFullscreenButton"
            );


        const readerCloseButton =
            document.getElementById(
                "readerCloseButton"
            );


        /* -----------------------------------------------
           Previous
        ----------------------------------------------- */

        if (previousButton) {

            addShareReaderHandler(
                previousButton,
                "click",
                function () {

                    console.log(
                        "[ShareViewer] Previous button."
                    );


                    readerPrevious();

                },
                false
            );

        }


        /* -----------------------------------------------
           Next
        ----------------------------------------------- */

        if (nextButton) {

            addShareReaderHandler(
                nextButton,
                "click",
                function () {

                    console.log(
                        "[ShareViewer] Next button."
                    );


                    readerNext();

                },
                false
            );

        }


        /* -----------------------------------------------
           Rotate
        ----------------------------------------------- */

        if (rotateButton) {

            addShareReaderHandler(
                rotateButton,
                "click",
                function () {

                    console.log(
                        "[ShareViewer] Rotate button."
                    );


                    performRotate();

                },
                false
            );

        }


        /* -----------------------------------------------
           Mute
        ----------------------------------------------- */

        if (muteButton) {

            addShareReaderHandler(
                muteButton,
                "click",
                function () {

                    console.log(
                        "[ShareViewer] Mute button."
                    );


                    performMute();

                },
                false
            );

        }


        /* -----------------------------------------------
           Share
        ----------------------------------------------- */

        if (shareButton) {

            addShareReaderHandler(
                shareButton,
                "click",
                function () {

                    console.log(
                        "[ShareViewer] Share button."
                    );


                    performShare();

                },
                false
            );

        }


        /* -----------------------------------------------
           Fullscreen
        ----------------------------------------------- */

        if (fullscreenButton) {

            addShareReaderHandler(
                fullscreenButton,
                "click",
                function () {

                    console.log(
                        "[ShareViewer] Fullscreen button."
                    );


                    enterShareFullscreen();

                },
                false
            );

        }


        /* -----------------------------------------------
           X / Reader Close
        ----------------------------------------------- */

        if (readerCloseButton) {

            addShareReaderHandler(
                readerCloseButton,
                "click",
                function () {

                    console.log(
                        "[ShareViewer] Reader close button."
                    );


                    close();

                },
                false
            );

        }


        /*
         * Mouse wheel handler must be attached AFTER
         * collecting the controls because it is part of
         * the ShareViewer-specific handler collection.
         */
        attachShareWheelNavigation();


        console.log(
            "[ShareViewer] Share Reader controls wired:",
            {
                previous: !!previousButton,
                next: !!nextButton,
                rotate: !!rotateButton,
                mute: !!muteButton,
                share: !!shareButton,
                fullscreen: !!fullscreenButton,
                readerClose: !!readerCloseButton
            }
        );

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


        if (!isBookShare) {

            selectors.push(
                "#workspace"
            );

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
            typeof window.SRNavigation ===
            "undefined" ||
            !window.SRNavigation
        ) {

            console.warn(
                "[ShareViewer] SRNavigation is unavailable."
            );


            return false;

        }


        try {

            if (
                typeof SRNavigation.initialized ===
                "function" &&
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


        let book = null;


        try {

            if (
                typeof Reader.currentBook ===
                "function"
            ) {

                book =
                    Reader.currentBook();

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

                SRNavigation.setCurrentBook(
                    book
                );

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
            typeof window.Reader ===
            "undefined" ||
            !Reader ||
            typeof Reader.open !==
            "function"
        ) {

            throw new Error(
                "Reader is unavailable."
            );

        }


        const viewerArea =
            document.getElementById(
                "viewerArea"
            );


        if (!viewerArea) {

            throw new Error(
                "#viewerArea was not found."
            );

        }


        detachExistingViewer(
            viewerArea
        );


        viewerArea.style.display = "";


        /*
         * Normal Reader opening remains untouched.
         */
        await Reader.open(item);


        /*
         * Synchronize Share Mode navigation with the
         * Reader instance that just opened.
         */
        initializeShareReaderNavigation(
            item
        );


        /*
         * Reader.open() can create/show its controls.
         */
        exposeBookControls();


        /*
         * Explicit Share Mode control wiring.
         */
        wireShareReaderControls();


        verifyBookControls();


        /*
         * Refresh dimensions after relocation.
         */
        try {

            if (
                typeof Reader.refresh ===
                "function"
            ) {

                requestAnimationFrame(
                    function () {

                        try {

                            Reader.refresh();

                        } catch (error) {

                            console.warn(
                                "[ShareViewer] Reader.refresh() failed:",
                                error
                            );

                        }

                    }
                );

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
            typeof window.VideoViewer !==
            "undefined" &&
            VideoViewer &&
            typeof VideoViewer.open ===
            "function"
        ) {

            await VideoViewer.open(item);
            return;

        }


        if (
            typeof window.VideoViewer !==
            "undefined" &&
            VideoViewer &&
            typeof VideoViewer.openVideo ===
            "function"
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
            typeof window.SlideshowViewer !==
            "undefined" &&
            SlideshowViewer &&
            typeof SlideshowViewer.open ===
            "function"
        ) {

            await SlideshowViewer.open(item);
            return;

        }


        if (
            typeof window.SlideshowViewer !==
            "undefined" &&
            SlideshowViewer &&
            typeof SlideshowViewer.openSlideshow ===
            "function"
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
            escapeText(
                item.title ||
                "Shared Media"
            );


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

    /*
     * Leave browser fullscreen if necessary.
     */
    try {

        if (
            document.fullscreenElement &&
            typeof document.exitFullscreen ===
            "function"
        ) {

            document.exitFullscreen()
                .catch(function () {});

        }

    } catch (error) {
        /* Ignore fullscreen cleanup errors */
    }


    /*
     * Remove ShareViewer-specific event listeners.
     */
    removeShareReaderHandlers();


    wheelBusy = false;


    /*
     * Close the underlying viewer.
     *
     * We deliberately DO NOT restore the normal Reader
     * interface afterward.
     */
    try {

        if (
            activeTarget &&
            (
                String(
                    activeTarget.section
                ).toLowerCase() === "book" ||

                String(
                    activeTarget.section
                ).toLowerCase() === "reader"
            ) &&
            typeof window.Reader !==
            "undefined" &&
            Reader &&
            typeof Reader.close ===
            "function"
        ) {

            Reader.close({
                playSound: false
            });

        }


        if (
            activeTarget &&
            String(
                activeTarget.section
            ).toLowerCase() === "video" &&
            typeof window.VideoViewer !==
            "undefined" &&
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
            String(
                activeTarget.section
            ).toLowerCase() === "slideshow" &&
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

    } catch (error) {

        console.warn(
            "[ShareViewer] Viewer close error:",
            error
        );

    }


    /*
     * IMPORTANT:
     *
     * Do NOT call restoreBookControls().
     *
     * The normal Reader UI must remain hidden while this
     * standalone Share Viewer remains on screen.
     */


    document.body.classList.add(
        "sky-share-mode"
    );


    /*
     * Keep all normal application areas hidden.
     */
    document
        .querySelectorAll(
            ".sky-share-hidden-app"
        )
        .forEach(function (el) {

            el.classList.add(
                "sky-share-hidden-app"
            );

        });


    /*
     * Explicitly keep the ordinary Reader interface hidden.
     */
    [
        "#workspace",
        "#toolbar",
        "#statusBar",
        ".sr-welcome-banner",
        "#librarySection",
        "#landingSection",
        "#mainNav",
        "#appSwitcher",
        "nav"
    ].forEach(function (selector) {

        document
            .querySelectorAll(selector)
            .forEach(function (el) {

                /*
                 * Don't hide anything belonging to the
                 * Share Viewer shell itself.
                 */
                if (
                    shell &&
                    shell.contains(el)
                ) {

                    return;

                }


                el.classList.add(
                    "sky-share-hidden-after-close"
                );

            });

    });


    /*
     * Remove the shared book from the Share media area,
     * but KEEP the Share shell itself.
     */
    const viewerArea =
        document.getElementById(
            "viewerArea"
        );


    if (viewerArea) {

        viewerArea.style.display =
            "none";

        viewerArea.classList.remove(
            "sky-share-mounted-viewer"
        );

    }


    /*
     * Leave the Share shell available for the future
     * decorated navigation button.
     */
    if (statusElement) {

        statusElement.textContent =
            "";

    }


    started = true;

    /*
     * Do NOT:
     *
     *   started = false
     *   activeItem = null
     *   activeTarget = null
     *   shell.remove()
     *   window.location.href = ...
     *
     * because Share Viewer remains the current page.
     */

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
                 * If browser fullscreen is active, let the
                 * browser's fullscreen behavior handle the
                 * first Escape.
                 */
                if (
                    document.fullscreenElement
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


        activeTarget =
            target || {
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


        isolateApplication(
            section
        );


        try {

            await openItem(
                item,
                activeTarget
            );


            /*
             * Re-isolate after Reader has opened.
             */
            isolateApplication(
                section
            );


            if (
                section === "book" ||
                section === "reader"
            ) {

                exposeBookControls();


                /*
                 * Re-wire once more because Reader.open()
                 * and the subsequent layout pass can modify
                 * the control DOM.
                 */
                wireShareReaderControls();


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

