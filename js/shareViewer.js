"use strict";

/*
=========================================================
 SkyMedia Share Viewer
 Clean Share Mode

 BOOK SHARE BEHAVIOR
 --------------------------------------------------------
 • One shared book only.
 • Existing Reader / Renderer / PageFlip engine retained.
 • Rotate removed from Share Mode.
 • Toolbar:
       Mute | Share | Fullscreen | X
 • Previous / Next are independent edge controls.
 • Previous hidden on page 1.
 • Next hidden on final page.
 • Existing Reader wheel navigation retained.
 • Last-page mouse click cannot close the book in Share Mode.
 • X closes the document but does NOT return to Reader landing.
 • X shows the large Open Meditation Mornings button.
 • Fullscreen keeps background.jpg.
 • Share header disappears in fullscreen.
 • Status bar remains directly below the symmetrical page gap.
 • Welcome banner remains directly below status bar.
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

    let closedPanel = null;
    let bookControlsBound = false;
    let pageStateTimer = null;

    const GLIDE_MEDIA_URL =
        "https://meditationmornings.glide.page/dl/media";


    /* =====================================================
       BASIC HELPERS
    ===================================================== */

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


    function isBookShare() {

        const section = String(
            activeTarget?.section ||
            activeItem?.type ||
            ""
        ).toLowerCase();

        return (
            section === "reader" ||
            section === "book"
        );
    }


    function sectionLabel(section) {

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


    /* =====================================================
       SHARE SHELL
    ===================================================== */

    function createShell() {

        if (shell) {
            return;
        }

        shell = createElement(
            "div",
            "sky-share-shell"
        );

        shell.id = "skyShareShell";


        const header = createElement(
            "header",
            "sky-share-header"
        );

        const brand = createElement(
            "div",
            "sky-share-brand"
        );

        const section = createElement(
            "div",
            "sky-share-section"
        );

        header.appendChild(brand);
        header.appendChild(section);


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


        mediaHost = createElement(
            "div",
            "sky-share-media-host"
        );

        mediaHost.id = "skyShareMediaHost";


        statusElement = createElement(
            "div",
            "sky-share-status"
        );


        main.appendChild(heading);
        main.appendChild(mediaHost);
        main.appendChild(statusElement);


        shell.appendChild(header);
        shell.appendChild(main);

        document.body.appendChild(shell);
    }


    /* =====================================================
       HIDE NORMAL APPLICATION
    ===================================================== */

    function isolateApplication() {

        document.body.classList.add(
            "sky-share-mode"
        );

        const selectors = [

            "#frontPage",
            "#frontSection",

            "#workspace",
            "#videoSection",
            "#slideshowSection",

            "#topBar",
            "#topSearchGroup",
            "#topBarRightControls",

            "#videoTopBar",
            "#videoLibrary",
            "#videoSearchGroup",
            "#videoTopBarRightControls",

            "#slideshowLibrary",
            ".slideshow-top-bar",

            ".app-switcher",
            ".responsive-app-menu",
            ".responsive-app-menu-button",

            "#readerLibrary",
            "#library",
            "#libraryPanel",
            "#readerDrawer",

            "#settingsPanel",
            "#settingsOverlay",

            ".video-library",
            ".slideshow-library"
        ];


        selectors.forEach(selector => {

            document
                .querySelectorAll(selector)
                .forEach(el => {

                    el.dataset.skyShareHidden =
                        "true";

                    el.style.setProperty(
                        "display",
                        "none",
                        "important"
                    );
                });
        });


        document
            .querySelectorAll(
                "[data-app-target], .app-switch-button"
            )
            .forEach(el => {

                el.dataset.skyShareHidden =
                    "true";

                el.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            });
    }


    /* =====================================================
       MOVE READER SURFACE
    ===================================================== */

    function moveIntoShareHost(element) {

        if (!element || !mediaHost) {
            return;
        }

        mediaHost.appendChild(element);

        element.style.removeProperty(
            "display"
        );
    }


    /* =====================================================
       REPLACE BUTTON
       ===================================================== */

    /*
     * Clone the Reader button so the normal Reader listener
     * attached to the original button does not remain active.
     *
     * Share Mode then owns these controls directly.
     */

    function replaceButton(id) {

        const oldButton =
            document.getElementById(id);

        if (!oldButton) {
            return null;
        }

        const newButton =
            oldButton.cloneNode(true);

        oldButton.replaceWith(newButton);

        return newButton;
    }


    /* =====================================================
       MUTE ICON
    ===================================================== */

    function updateMuteIcon() {

        const button =
            document.getElementById(
                "muteButton"
            );

        if (!button) {
            return;
        }

        const muted = !!(
            window.AudioController &&
            typeof AudioController.isMuted ===
                "function" &&
            AudioController.isMuted()
        );


        const use =
            button.querySelector("use");

        if (use) {

            use.setAttribute(
                "href",
                muted
                    ? "#icon-muted"
                    : "#icon-volume"
            );
        }


        button.classList.toggle(
            "active",
            muted
        );

        button.classList.toggle(
            "is-muted",
            muted
        );

        button.setAttribute(
            "aria-pressed",
            muted ? "true" : "false"
        );

        button.setAttribute(
            "aria-label",
            muted ? "Unmute" : "Mute"
        );

        button.title =
            muted ? "Unmute" : "Mute";
    }


    /* =====================================================
       FULLSCREEN ICON
    ===================================================== */

    function updateFullscreenIcon() {

        const button =
            document.getElementById(
                "viewerFullscreenButton"
            );

        if (!button) {
            return;
        }

        const active =
            document.fullscreenElement === shell;

        const use =
            button.querySelector("use");

        if (use) {

            use.setAttribute(
                "href",
                active
                    ? "#icon-fullscreen-exit"
                    : "#icon-fullscreen"
            );
        }

        button.setAttribute(
            "aria-pressed",
            active ? "true" : "false"
        );

        button.setAttribute(
            "aria-label",
            active
                ? "Exit fullscreen"
                : "Fullscreen"
        );

        button.title =
            active
                ? "Exit fullscreen"
                : "Fullscreen";
    }


    /* =====================================================
       PAGE BUTTON VISIBILITY
    ===================================================== */

    function updatePageButtons() {

        if (!isBookShare()) {
            return;
        }

        if (
            !window.Reader ||
            typeof Reader.currentPage !==
                "function" ||
            typeof Reader.pages !==
                "function"
        ) {
            return;
        }


        const page =
            Number(
                Reader.currentPage()
            ) || 1;

        const pages =
            Number(
                Reader.pages()
            ) || 0;


        const previous =
            document.getElementById(
                "previousButton"
            );

        const next =
            document.getElementById(
                "nextButton"
            );


        if (previous) {

            const hidden =
                page <= 1;

            previous.hidden =
                hidden;

            previous.setAttribute(
                "aria-hidden",
                hidden
                    ? "true"
                    : "false"
            );
        }


        if (next) {

            const hidden =
                pages > 0 &&
                page >= pages;

            next.hidden =
                hidden;

            next.setAttribute(
                "aria-hidden",
                hidden
                    ? "true"
                    : "false"
            );
        }
    }


    /* =====================================================
       PAGE STATE WATCHER
    ===================================================== */

    function startPageWatcher() {

        stopPageWatcher();

        pageStateTimer =
            setInterval(
                updatePageButtons,
                150
            );
    }


    function stopPageWatcher() {

        if (pageStateTimer) {

            clearInterval(
                pageStateTimer
            );

            pageStateTimer = null;
        }
    }


    /* =====================================================
       FULLSCREEN
    ===================================================== */

    function enterFullscreen() {

        if (!shell) {
            return;
        }

        if (
            document.fullscreenElement === shell
        ) {
            return;
        }

        if (
            typeof shell.requestFullscreen ===
            "function"
        ) {

            shell.requestFullscreen()
                .catch(error => {

                    console.warn(
                        "[SkyMedia Share] Fullscreen failed.",
                        error
                    );
                });
        }
    }


    function exitFullscreen() {

        if (
            document.fullscreenElement &&
            typeof document.exitFullscreen ===
                "function"
        ) {

            document.exitFullscreen()
                .catch(() => {});
        }
    }


    /* =====================================================
       SHARE BOOK CONTROLS
    ===================================================== */

    function bindBookControls() {

        if (bookControlsBound) {
            updateMuteIcon();
            updatePageButtons();
            return;
        }

        bookControlsBound = true;


        const toolbar =
            document.getElementById(
                "toolbar"
            );

        if (!toolbar) {
            return;
        }


        /*
         * Replace the Reader buttons before rearranging them.
         */
        replaceButton("previousButton");
        replaceButton("nextButton");
        replaceButton("muteButton");
        replaceButton("readerShareButton");
        replaceButton("viewerFullscreenButton");
        replaceButton("readerCloseButton");

        /*
         * Rotate and bookmark are deliberately removed.
         */
        replaceButton("rotateButton");
        replaceButton("bookmarkAddButton");


        const previous =
            document.getElementById(
                "previousButton"
            );

        const next =
            document.getElementById(
                "nextButton"
            );

        const mute =
            document.getElementById(
                "muteButton"
            );

        const share =
            document.getElementById(
                "readerShareButton"
            );

        const fullscreen =
            document.getElementById(
                "viewerFullscreenButton"
            );

        const closeButton =
            document.getElementById(
                "readerCloseButton"
            );


        /*
         * IMPORTANT:
         *
         * Previous and Next are removed from the toolbar.
         * They become independent controls positioned relative
         * to the Share media host.
         */
        if (previous) {
            mediaHost.appendChild(
                previous
            );
        }

        if (next) {
            mediaHost.appendChild(
                next
            );
        }


        /*
         * The toolbar now contains ONLY:
         *
         * Mute | Share | Fullscreen | X
         */
        toolbar.replaceChildren(
            mute,
            share,
            fullscreen,
            closeButton
        );


        /* -------------------------------------------------
           Previous
        ------------------------------------------------- */

        previous?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                const page =
                    Number(
                        Reader.currentPage?.()
                    ) || 1;

                if (page <= 1) {
                    updatePageButtons();
                    return;
                }

                if (
                    window.SRNavigation &&
                    typeof SRNavigation.previous ===
                        "function"
                ) {

                    SRNavigation.previous();
                }

                setTimeout(
                    updatePageButtons,
                    80
                );

                setTimeout(
                    updatePageButtons,
                    500
                );
            }
        );


        /* -------------------------------------------------
           Next
        ------------------------------------------------- */

        next?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                const page =
                    Number(
                        Reader.currentPage?.()
                    ) || 1;

                const pages =
                    Number(
                        Reader.pages?.()
                    ) || 0;


                if (
                    pages &&
                    page >= pages
                ) {

                    updatePageButtons();
                    return;
                }


                if (
                    window.SRNavigation &&
                    typeof SRNavigation.next ===
                        "function"
                ) {

                    SRNavigation.next();
                }

                setTimeout(
                    updatePageButtons,
                    80
                );

                setTimeout(
                    updatePageButtons,
                    500
                );
            }
        );


        /* -------------------------------------------------
           Mute
        ------------------------------------------------- */

        mute?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                if (
                    window.AudioController &&
                    typeof AudioController.toggleMute ===
                        "function"
                ) {

                    AudioController.toggleMute();
                }

                updateMuteIcon();
            }
        );


        /* -------------------------------------------------
           Share
        ------------------------------------------------- */

        share?.addEventListener(
            "click",
            async event => {

                event.preventDefault();
                event.stopPropagation();

                const book =
                    window.Reader &&
                    typeof Reader.book ===
                        "function"
                        ? Reader.book()
                        : activeItem;


                if (
                    book &&
                    book.id &&
                    window.ShareManager &&
                    typeof ShareManager.share ===
                        "function"
                ) {

                    /*
                     * This is the existing KV/short-link
                     * implementation. No long URL is constructed
                     * by ShareViewer.
                     */
                    await ShareManager.share(
                        "reader",
                        book
                    );
                }
            }
        );


        /* -------------------------------------------------
           Fullscreen
        ------------------------------------------------- */

        fullscreen?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                if (
                    document.fullscreenElement ===
                    shell
                ) {

                    exitFullscreen();

                } else {

                    enterFullscreen();
                }
            }
        );


        /* -------------------------------------------------
           X
        ------------------------------------------------- */

        closeButton?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                close();
            }
        );


        updateMuteIcon();
        updatePageButtons();

        startPageWatcher();
    }


    /* =====================================================
       LAST PAGE CLICK PROTECTION
    ===================================================== */

    function bindLastPageProtection() {

        if (
            document.body.dataset
                .skyShareLastPageGuard ===
            "true"
        ) {
            return;
        }

        document.body.dataset
            .skyShareLastPageGuard =
            "true";


        /*
         * Normal SRNavigation has a bubble-phase listener
         * which closes the Reader when skyreader:last-page-click
         * fires.
         *
         * This Share listener is capture-phase and therefore
         * intercepts that event before normal Reader navigation
         * can close the document.
         */
        document.addEventListener(
            "skyreader:last-page-click",
            event => {

                if (
                    !document.body.classList.contains(
                        "sky-share-mode"
                    )
                ) {
                    return;
                }

                if (!isBookShare()) {
                    return;
                }

                event.preventDefault();
                event.stopImmediatePropagation();

                updatePageButtons();
            },
            true
        );
    }


    /* =====================================================
       CLOSED STATE
    ===================================================== */

    function showClosedPanel() {

        if (!shell) {
            return;
        }


        shell.classList.add(
            "sky-share-document-closed"
        );


        if (!closedPanel) {

            closedPanel =
                createElement(
                    "div",
                    "sky-share-closed-panel"
                );


            const button =
                createElement(
                    "a",
                    "sky-share-big-open-button",
                    "Open Meditation Mornings"
                );


            button.href =
                GLIDE_MEDIA_URL;

            button.target =
                "_blank";

            button.rel =
                "noopener noreferrer";


            closedPanel.appendChild(
                button
            );


            shell
                .querySelector(
                    ".sky-share-main"
                )
                ?.appendChild(
                    closedPanel
                );
        }


        closedPanel.hidden = false;

        closedPanel.style.display =
            "flex";
    }


    /* =====================================================
       CLOSE
    ===================================================== */

    function close() {

        stopPageWatcher();

        exitFullscreen();


        try {

            if (
                isBookShare() &&
                window.Reader &&
                typeof Reader.close ===
                    "function" &&
                Reader.isOpen()
            ) {

                Reader.close({
                    playSound: false
                });
            }

        } catch (error) {

            console.warn(
                "[SkyMedia Share] Reader close cleanup:",
                error
            );
        }


        /*
         * Reader.close() normally restores the Reader landing.
         * That is correct for normal Reader use but NOT for Share Mode.
         *
         * Immediately reassert Share Mode isolation.
         */
        isolateApplication();


        /*
         * Hide every normal Reader surface that Reader.close()
         * may have restored.
         */
        [
            "#workspace",
            "#topBar",
            "#topSearchGroup",
            "#topBarRightControls",
            "#library",
            "#libraryPanel",
            "#readerLibrary",
            "#readerDrawer",
            "#toolbar",
            "#viewerArea",
            "#statusBar"
        ].forEach(selector => {

            document
                .querySelectorAll(selector)
                .forEach(el => {

                    el.style.setProperty(
                        "display",
                        "none",
                        "important"
                    );
                });
        });


        document
            .querySelectorAll(
                ".sr-welcome-banner"
            )
            .forEach(el => {

                el.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            });


        /*
         * Share shell remains the visible application.
         */
        showClosedPanel();
    }


    /* =====================================================
       FULLSCREEN CHANGE
    ===================================================== */

    function bindFullscreenChange() {

        document.addEventListener(
            "fullscreenchange",
            () => {

                if (
                    !document.body.classList.contains(
                        "sky-share-mode"
                    )
                ) {
                    return;
                }

                updateFullscreenIcon();
            }
        );
    }


    /* =====================================================
       ESCAPE
    ===================================================== */

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

                if (
                    event.key !== "Escape"
                ) {
                    return;
                }


                event.preventDefault();


                if (
                    document.fullscreenElement ===
                    shell
                ) {

                    exitFullscreen();
                    return;
                }


                if (
                    isBookShare() &&
                    !shell.classList.contains(
                        "sky-share-document-closed"
                    )
                ) {

                    close();
                }
            }
        );
    }


    /* =====================================================
       BOOK
    ===================================================== */

    async function prepareBook(item) {

        if (
            !window.Reader ||
            typeof Reader.open !==
                "function"
        ) {

            throw new Error(
                "Share Mode: Reader.open() unavailable."
            );
        }


        const viewer =
            document.getElementById(
                "viewerArea"
            );

        if (!viewer) {

            throw new Error(
                "Share Mode: #viewerArea not found."
            );
        }


        /*
         * Open the book through the existing Reader first.
         */
        await Reader.open(item);


        /*
         * Move the live Reader surface into Share Mode.
         */
        moveIntoShareHost(viewer);

        viewer.classList.add(
            "sky-share-mounted-viewer"
        );


        /*
         * Move the Reader toolbar into Share Mode.
         */
        const toolbar =
            document.getElementById(
                "toolbar"
            );

        if (toolbar) {
            moveIntoShareHost(toolbar);
        }


        /*
         * Status MUST immediately follow viewerArea.
         */
        const status =
            document.getElementById(
                "statusBar"
            );

        if (status) {
            moveIntoShareHost(status);
        }


        /*
         * Welcome MUST remain immediately below status.
         */
        const welcome =
            document.querySelector(
                ".sr-welcome-banner"
            );

        if (welcome) {
            moveIntoShareHost(welcome);
        }


        /*
         * Tell SRNavigation which book Share Mode owns.
         *
         * Do NOT attach another wheel listener.
         * The existing navigation.js wheel listener already
         * belongs to #viewerArea.
         */
        if (window.SRNavigation) {

            if (
                typeof SRNavigation.initialize ===
                    "function"
            ) {
                SRNavigation.initialize();
            }

            if (
                typeof SRNavigation.setCurrentBook ===
                    "function"
            ) {
                SRNavigation.setCurrentBook(item);
            }
        }


        bindBookControls();
        bindLastPageProtection();

        updateMuteIcon();
        updatePageButtons();


        requestAnimationFrame(() => {

            if (
                window.Reader &&
                typeof Reader.refresh ===
                    "function"
            ) {
                Reader.refresh();
            }

            updatePageButtons();
        });
    }


    /* =====================================================
       VIDEO
    ===================================================== */

    async function prepareVideo(item) {

        if (
            window.VideoLibrary &&
            typeof VideoLibrary.init ===
                "function"
        ) {

            VideoLibrary.init();

            if (
                typeof VideoLibrary.load ===
                    "function" &&
                window.Manifest &&
                typeof Manifest.videos ===
                    "function"
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
            typeof VideoViewer.init ===
                "function"
        ) {
            VideoViewer.init();
        }


        moveIntoShareHost(viewer);


        if (
            !window.VideoViewer ||
            typeof VideoViewer.openVideo !==
                "function"
        ) {

            throw new Error(
                "Share Mode: VideoViewer.openVideo() unavailable."
            );
        }


        return VideoViewer.openVideo(
            item
        );
    }


    /* =====================================================
       SLIDESHOW
    ===================================================== */

    async function prepareSlideshow(item) {

        if (
            typeof SlideshowLibrary ===
                "undefined"
        ) {

            throw new Error(
                "Share Mode: SlideshowLibrary unavailable."
            );
        }


        if (
            typeof SlideshowViewer ===
                "undefined"
        ) {

            throw new Error(
                "Share Mode: SlideshowViewer unavailable."
            );
        }


        if (
            typeof SlideshowLibrary.init ===
                "function"
        ) {
            SlideshowLibrary.init();
        }


        if (
            typeof Manifest !==
                "undefined" &&
            Manifest.slideshows &&
            typeof Manifest.slideshows.load ===
                "function"
        ) {

            await Manifest.slideshows.load();
        }


        if (
            typeof SlideshowViewer.init ===
                "function"
        ) {
            SlideshowViewer.init();
        }


        if (
            typeof SlideshowUI !==
                "undefined" &&
            typeof SlideshowUI.init ===
                "function"
        ) {
            SlideshowUI.init();
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


        moveIntoShareHost(viewer);


        await SlideshowViewer.open(
            item
        );
    }


    /* =====================================================
       OPEN ITEM
    ===================================================== */

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
            String(
                item.title ||
                "Meditation Mornings"
            ).trim();


        subtitleElement.textContent =
            String(
                item.subtitle ||
                ""
            ).trim();


        const sectionElement =
            shell.querySelector(
                ".sky-share-section"
            );

        if (sectionElement) {

            sectionElement.textContent =
                sectionLabel(section);
        }


        statusElement.textContent =
            "Opening " +
            sectionLabel(section).toLowerCase() +
            "…";


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


        statusElement.textContent = "";
    }


    /* =====================================================
       START
    ===================================================== */

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

        activeItem = item;
        activeTarget = target;


        try {

            createShell();

            bindEscape();
            bindFullscreenChange();
            bindLastPageProtection();


            await openItem(
                item,
                target
            );


            /*
             * Hide normal application only after the shared
             * item has successfully opened.
             */
            isolateApplication();


            shell.style.zIndex =
                "999999";


        } catch (error) {

            started = false;

            console.error(
                "[SkyMedia Share] STARTUP FAILED:",
                error
            );

            throw error;
        }
    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

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