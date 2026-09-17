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
 • Forward wheel scrolling cannot move beyond the final page.
 • X closes the document but does NOT return to Reader landing.
 • X shows the large Open Meditation Mornings image button.
 • Fullscreen keeps background.jpg.
 • Share header disappears in fullscreen.
 • Status bar remains directly below the symmetrical page gap.
 • Welcome banner remains directly below status bar.
 • Existing Reader page indicator is preserved and explicitly
   synchronized by Share Mode after the Reader surface is moved.

 BOOK STATUS FORMAT
 --------------------------------------------------------
      Book Title        [ 2–3 / 24 ]

 • Book title is plain text.
 • Page/spread count is the only content inside #pageIndicator.
 • The title is NOT placed inside #pageIndicator.

 CLOSED STATE
 --------------------------------------------------------
 • Applies to BOOK, VIDEO, and SLIDESHOW shares.
 • Existing small bottom-right Open Meditation Mornings
   button is unchanged.
 • A separate large assets/go-button.png image is centered
   on desktop.
 • assets/go-button-mobile.png is used on smaller screens.
 • Mobile Go button fills the available viewport width.
 • Large image links to Meditation Mornings.
 • Item viewers and item-specific controls are hidden when closed.
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
    let closedGoButtonResizeBound = false;

    let bookControlsBound = false;
    let pageStateTimer = null;

    let bookZoomController = null;
    let bookZoomTarget = null;

    let controlsIdleTimer = null;
    let controlsActivityBound = false;

let bookResizeObserver = null;
let bookResizeTimer = null;
let bookResizeRaf = 0;
let bookResponsiveRefreshBound = false;

    let shareClosing = false;

    let mediaCloseClickBound = false;

    let bookGestureBound = false;
    let bookWheelTarget = null;
    let bookTouchTarget = null;
    let bookWheelLocked = false;
    let bookTouchTracking = false;
    let bookTouchStartX = 0;
    let bookTouchStartY = 0;
    let bookSuppressClickUntil = 0;

    const BOOK_TOUCH_THRESHOLD = 48;

    const GLIDE_MEDIA_URL =
        "https://meditationmornings.glide.page/dl/media";


    /* =====================================================
       BASIC HELPERS
    ===================================================== */

    function createElement(
        tag,
        className,
        text
    ) {

        const el =
            document.createElement(tag);

        if (className) {
            el.className =
                className;
        }

        if (text !== undefined) {
            el.textContent =
                text;
        }

        return el;
    }


    function isBookShare() {

        const section =
            String(
                activeTarget?.section ||
                activeItem?.type ||
                ""
            ).toLowerCase();

        return (
            section === "reader" ||
            section === "book"
        );
    }


    function isVideoShare() {

        const section =
            String(
                activeTarget?.section ||
                activeItem?.type ||
                ""
            ).toLowerCase();

        return section === "video";
    }


    function isSlideshowShare() {

        const section =
            String(
                activeTarget?.section ||
                activeItem?.type ||
                ""
            ).toLowerCase();

        return (
            section === "slideshow" ||
            section === "slides"
        );
    }


    function sectionLabel(section) {

        switch (
            String(section || "").toLowerCase()
        ) {

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
       SHARE BOOK PAGE INDICATOR

       The Reader already owns:

           #readerTitle
           #pageIndicator

       We deliberately keep those as separate elements.

       Result:

           Book Title      [ 2–3 / 24 ]

       The title is NOT inserted into #pageIndicator.
    ===================================================== */

    function updateShareBookIndicator() {

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


        const indicator =
            document.getElementById(
                "pageIndicator"
            );


        const readerTitle =
            document.getElementById(
                "readerTitle"
            );


        const book =
            typeof Reader.book ===
                "function"
                ? Reader.book()
                : null;


        const title =
            String(
                book?.title ||
                activeItem?.title ||
                ""
            ).trim();


        /*
        -------------------------------------------------------
         TITLE
         -------------------------------------------------------
         */

        if (readerTitle) {

            readerTitle.textContent =
                title;

            readerTitle.hidden =
                false;

            readerTitle.removeAttribute(
                "aria-hidden"
            );

            readerTitle.style.removeProperty(
                "display"
            );

            readerTitle.style.removeProperty(
                "visibility"
            );

            readerTitle.style.removeProperty(
                "opacity"
            );
        }


        if (!indicator) {
            return;
        }


        /*
        -------------------------------------------------------
         Let the normal Reader UI establish its spread
         information first.
        -------------------------------------------------------
        */

        if (
            typeof window.updatePageIndicator ===
                "function"
        ) {

            try {

                window.updatePageIndicator();

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Reader page indicator refresh:",
                    error
                );
            }
        }


        const page =
            Number(
                Reader.currentPage()
            ) || 1;


        const pages =
            Number(
                Reader.pages()
            ) || 0;


        let label = "";


        if (
            typeof Reader.spread ===
                "function"
        ) {

            try {

                const spread =
                    Reader.spread();


                if (
                    spread &&
                    spread.label !==
                        undefined &&
                    spread.label !==
                        null
                ) {

                    label =
                        String(
                            spread.label
                        ).trim();
                }

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Reader spread lookup:",
                    error
                );
            }
        }


        if (!label) {

            label =
                String(page);
        }


        /*
        -------------------------------------------------------
         #pageIndicator contains ONLY:

             2–3 / 24
         -------------------------------------------------------
         */

        indicator.textContent =
            label +
            " / " +
            (pages || "");


        indicator.hidden =
            false;


        indicator.removeAttribute(
            "aria-hidden"
        );


        indicator.tabIndex =
            0;


        indicator.style.removeProperty(
            "display"
        );


        indicator.style.removeProperty(
            "visibility"
        );


        indicator.style.removeProperty(
            "opacity"
        );


        indicator.classList.add(
            "pageIndicatorActive"
        );
    }


    /* =====================================================
       LARGE CLOSED-STATE GO BUTTON
    ===================================================== */

    function updateClosedGoButtonLayout() {

        if (!closedPanel) {
            return;
        }


        const button =
            closedPanel.querySelector(
                ".sky-share-closed-go-button"
            );


        if (!button) {
            return;
        }


        const isMobile =
            window.matchMedia(
                "(max-width: 700px)"
            ).matches;


        if (isMobile) {

            /*
             * Mobile image fills the viewport width.
             */
            button.style.setProperty(
                "width",
                "100vw",
                "important"
            );

            button.style.setProperty(
                "max-width",
                "100vw",
                "important"
            );

            button.style.setProperty(
                "max-height",
                "100vh",
                "important"
            );

        }
        else {

            /*
             * Larger desktop presentation.
             */
            button.style.setProperty(
                "width",
                "min(92vw, 1400px)",
                "important"
            );

            button.style.setProperty(
                "max-width",
                "92vw",
                "important"
            );

            button.style.setProperty(
                "max-height",
                "84vh",
                "important"
            );
        }
    }


    function bindClosedGoButtonResize() {

        if (closedGoButtonResizeBound) {
            return;
        }


        closedGoButtonResizeBound =
            true;


        window.addEventListener(
            "resize",
            function () {

                updateClosedGoButtonLayout();

            },
            {
                passive: true
            }
        );
    }


    function createClosedGoButton() {

        if (!closedPanel) {
            return null;
        }


        let button =
            closedPanel.querySelector(
                ".sky-share-closed-go-button"
            );


        if (button) {

            updateClosedGoButtonLayout();

            return button;
        }


        button =
            document.createElement("a");


        button.className =
            "sky-share-closed-go-button";


        button.href =
            GLIDE_MEDIA_URL;


        button.target =
            "_blank";


        button.rel =
            "noopener noreferrer";


        button.setAttribute(
            "aria-label",
            "Open Meditation Mornings"
        );


        /*
        -------------------------------------------------------
         Fixed centered presentation.

         Movement has deliberately been omitted for now.
        -------------------------------------------------------
        */

        button.style.setProperty(
            "position",
            "absolute",
            "important"
        );


        button.style.setProperty(
            "left",
            "50%",
            "important"
        );


        button.style.setProperty(
            "top",
            "50%",
            "important"
        );


        button.style.setProperty(
            "transform",
            "translate(-50%, -50%)",
            "important"
        );


        button.style.setProperty(
            "height",
            "auto",
            "important"
        );


        button.style.setProperty(
            "padding",
            "0",
            "important"
        );


        button.style.setProperty(
            "margin",
            "0",
            "important"
        );


        button.style.setProperty(
            "border",
            "0",
            "important"
        );


        button.style.setProperty(
            "outline",
            "none",
            "important"
        );


        button.style.setProperty(
            "text-decoration",
            "none",
            "important"
        );


        button.style.setProperty(
            "cursor",
            "pointer",
            "important"
        );


        button.style.setProperty(
            "box-sizing",
            "border-box",
            "important"
        );


        button.style.setProperty(
            "z-index",
            "10000",
            "important"
        );


        button.style.setProperty(
            "display",
            "block",
            "important"
        );


        button.style.setProperty(
            "pointer-events",
            "auto",
            "important"
        );


        /*
        -------------------------------------------------------
         Use mobile-specific image on smaller screens.
        -------------------------------------------------------
        */

        const picture =
            document.createElement("picture");


        const mobileSource =
            document.createElement("source");


        mobileSource.media =
            "(max-width: 700px)";


        mobileSource.srcset =
            new URL(
                "/assets/go-button-mobile.png",
                window.location.origin
            ).href;


        picture.appendChild(
            mobileSource
        );


        const image =
            document.createElement("img");


        image.src =
            new URL(
                "/assets/go-button.png",
                window.location.origin
            ).href;


        image.alt =
            "Open Meditation Mornings";


        image.draggable =
            false;


        image.style.setProperty(
            "display",
            "block",
            "important"
        );


        image.style.setProperty(
            "width",
            "100%",
            "important"
        );


        image.style.setProperty(
            "height",
            "auto",
            "important"
        );


        image.style.setProperty(
            "max-width",
            "100%",
            "important"
        );


        image.style.setProperty(
            "max-height",
            "100vh",
            "important"
        );


        image.style.setProperty(
            "object-fit",
            "contain",
            "important"
        );


        /*
         * The anchor owns the click.
         * The image does not intercept it.
         */
        image.style.setProperty(
            "pointer-events",
            "none",
            "important"
        );


        image.style.setProperty(
            "user-select",
            "none",
            "important"
        );


        image.style.setProperty(
            "-webkit-user-drag",
            "none",
            "important"
        );


        picture.appendChild(
            image
        );


        button.appendChild(
            picture
        );


        closedPanel.appendChild(
            button
        );


        bindClosedGoButtonResize();


        updateClosedGoButtonLayout();


        return button;
    }


    /* =====================================================
       SHARE SHELL
    ===================================================== */

    function createShell() {

        if (shell) {
            return;
        }


        shell =
            createElement(
                "div",
                "sky-share-shell"
            );


        shell.id =
            "skyShareShell";


        const header =
            createElement(
                "header",
                "sky-share-header"
            );


        const brand =
            createElement(
                "div",
                "sky-share-brand"
            );


        const section =
            createElement(
                "div",
                "sky-share-section"
            );


        header.appendChild(
            brand
        );


        header.appendChild(
            section
        );


        const main =
            createElement(
                "main",
                "sky-share-main"
            );


        const heading =
            createElement(
                "div",
                "sky-share-heading"
            );


        titleElement =
            createElement(
                "h1",
                "sky-share-title"
            );


        subtitleElement =
            createElement(
                "div",
                "sky-share-subtitle"
            );


        heading.appendChild(
            titleElement
        );


        heading.appendChild(
            subtitleElement
        );


        mediaHost =
            createElement(
                "div",
                "sky-share-media-host"
            );


        mediaHost.id =
            "skyShareMediaHost";


        statusElement =
            createElement(
                "div",
                "sky-share-status"
            );


        const primaryLogo =
            document.getElementById(
                "workspacePrimaryLogo"
            );


        if (primaryLogo) {

            primaryLogo.classList.add(
                "sky-share-primary-logo"
            );


            primaryLogo.style.display =
                "block";


            shell.appendChild(
                primaryLogo
            );
        }


        /*
        -------------------------------------------------------
         Existing persistent bottom-right button.
         DO NOT CHANGE THIS BUTTON.
        -------------------------------------------------------
        */

        const actions =
            createElement(
                "div",
                "sky-share-actions"
            );


        const openButton =
            createElement(
                "a",
                "sky-share-open-button",
                "Open Meditation Mornings"
            );


        openButton.href =
            GLIDE_MEDIA_URL;


        openButton.target =
            "_blank";


        openButton.rel =
            "noopener noreferrer";


        const closeButton =
            createElement(
                "button",
                "sky-share-close-button",
                "×"
            );


        closeButton.type =
            "button";


        closeButton.setAttribute(
            "aria-label",
            "Close"
        );


        closeButton.title =
            "Close";


        closeButton.addEventListener(
            "click",
            close
        );


        actions.appendChild(
            openButton
        );


        actions.appendChild(
            closeButton
        );


        main.appendChild(
            heading
        );


        main.appendChild(
            mediaHost
        );


        main.appendChild(
            statusElement
        );


        shell.appendChild(
            header
        );


        shell.appendChild(
            main
        );


        shell.appendChild(
            actions
        );


        document.body.appendChild(
            shell
        );
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


        selectors.forEach(
            selector => {

                document
                    .querySelectorAll(
                        selector
                    )
                    .forEach(
                        el => {

                            el.dataset.skyShareHidden =
                                "true";


                            el.style.setProperty(
                                "display",
                                "none",
                                "important"
                            );
                        }
                    );
            }
        );


        document
            .querySelectorAll(
                "[data-app-target], .app-switch-button"
            )
            .forEach(
                el => {

                    el.dataset.skyShareHidden =
                        "true";


                    el.style.setProperty(
                        "display",
                        "none",
                        "important"
                    );
                }
            );
    }


    /* =====================================================
       MOVE READER SURFACE
    ===================================================== */

    function moveIntoShareHost(element) {

        if (
            !element ||
            !mediaHost
        ) {
            return;
        }


        mediaHost.appendChild(
            element
        );


        element.style.removeProperty(
            "display"
        );
    }


    /* =====================================================
       REPLACE BUTTON
    ===================================================== */

    function replaceButton(id) {

        const oldButton =
            document.getElementById(
                id
            );


        if (!oldButton) {
            return null;
        }


        const newButton =
            oldButton.cloneNode(
                true
            );


        oldButton.replaceWith(
            newButton
        );


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


        const muted =
            !!(
                window.AudioController &&
                typeof AudioController.isMuted ===
                    "function" &&
                AudioController.isMuted()
            );


        const use =
            button.querySelector(
                "use"
            );


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
            muted
                ? "true"
                : "false"
        );


        button.setAttribute(
            "aria-label",
            muted
                ? "Unmute"
                : "Mute"
        );


        button.title =
            muted
                ? "Unmute"
                : "Mute";
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
            document.fullscreenElement ===
            shell;


        const use =
            button.querySelector(
                "use"
            );


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
            active
                ? "true"
                : "false"
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


        updateShareBookIndicator();
    }


    /* =====================================================
       PAGE STATE WATCHER
    ===================================================== */

    function startPageWatcher() {

        stopPageWatcher();


        pageStateTimer =
            setInterval(
                function () {

                    updatePageButtons();

                },
                150
            );
    }


    function stopPageWatcher() {

        if (pageStateTimer) {

            clearInterval(
                pageStateTimer
            );


            pageStateTimer =
                null;
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
            document.fullscreenElement ===
            shell
        ) {
            return;
        }


        if (
            typeof shell.requestFullscreen ===
                "function"
        ) {

            shell.requestFullscreen()
                .catch(
                    error => {

                        console.warn(
                            "[SkyMedia Share] Fullscreen failed.",
                            error
                        );
                    }
                );
        }
    }


    function exitFullscreen() {

        if (
            document.fullscreenElement &&
            typeof document.exitFullscreen ===
                "function"
        ) {

            document.exitFullscreen()
                .catch(
                    () => {}
                );
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


        const toolbar =
            document.getElementById(
                "toolbar"
            );


        if (!toolbar) {
            return;
        }


        bookControlsBound =
            true;


        replaceButton(
            "previousButton"
        );


        replaceButton(
            "nextButton"
        );


        replaceButton(
            "muteButton"
        );


        replaceButton(
            "readerShareButton"
        );


        replaceButton(
            "viewerFullscreenButton"
        );


        replaceButton(
            "readerCloseButton"
        );


        replaceButton(
            "rotateButton"
        );


        replaceButton(
            "bookmarkAddButton"
        );


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

                }
                else {

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
       HIDE ITEM-SPECIFIC CONTROLS
    ===================================================== */

    function hideSharedItemControls() {

        const selectors = [

            /* Reader */
            "#toolbar",
            "#statusBar",
            "#previousButton",
            "#nextButton",
            "#previousPage",
            "#nextPage",

            /* Video */
            "#videoTopBar",
            "#videoControls",
            "#videoViewerControls",
            "#videoPlayerControls",
            ".video-controls",
            ".video-player-controls",
            ".video-control-bar",
            ".video-toolbar",

            /* Slideshow */
            ".slideshow-top-bar",
            ".slideshow-controls",
            ".slideshow-control-bar",
            ".slideshow-toolbar",
            ".slideshow-buttons",
            "#slideshowControls",
            "#slideshowViewerControls"
        ];


        selectors.forEach(
            selector => {

                document
                    .querySelectorAll(
                        selector
                    )
                    .forEach(
                        element => {

                            element.style.setProperty(
                                "display",
                                "none",
                                "important"
                            );

                            element.style.setProperty(
                                "visibility",
                                "hidden",
                                "important"
                            );

                            element.style.setProperty(
                                "opacity",
                                "0",
                                "important"
                            );
                        }
                    );
            }
        );
    }


    /* =====================================================
       HIDE ITEM VIEWERS / MEDIA SURFACES
    ===================================================== */

    function hideSharedItemSurfaces() {

        /*
         * Hide the entire mounted media surface.
         * This guarantees that an old video/slideshow/book
         * cannot remain visible behind the closed panel.
         */
        if (mediaHost) {

            mediaHost.style.setProperty(
                "display",
                "none",
                "important"
            );

            mediaHost.style.setProperty(
                "visibility",
                "hidden",
                "important"
            );

            mediaHost.style.setProperty(
                "opacity",
                "0",
                "important"
            );

            mediaHost.style.setProperty(
                "pointer-events",
                "none",
                "important"
            );
        }


        /*
         * Explicitly hide the original viewers as well.
         * This matters for video/slideshow implementations that
         * may have additional controls or overlays outside
         * mediaHost.
         */
        [
            "#viewerArea",
            "#videoViewer",
            "#slideshowViewer",
            "#videoSection",
            "#slideshowSection"
        ].forEach(
            selector => {

                document
                    .querySelectorAll(
                        selector
                    )
                    .forEach(
                        element => {

                            element.style.setProperty(
                                "display",
                                "none",
                                "important"
                            );

                            element.style.setProperty(
                                "visibility",
                                "hidden",
                                "important"
                            );

                            element.style.setProperty(
                                "opacity",
                                "0",
                                "important"
                            );

                            element.style.setProperty(
                                "pointer-events",
                                "none",
                                "important"
                            );
                        }
                    );
            }
        );


        /*
         * Hide our temporary Share status while closed.
         */
        if (statusElement) {

            statusElement.style.setProperty(
                "display",
                "none",
                "important"
            );

            statusElement.style.setProperty(
                "visibility",
                "hidden",
                "important"
            );

            statusElement.style.setProperty(
                "opacity",
                "0",
                "important"
            );
        }
    }


        /* =====================================================
       STOP NON-BOOK MEDIA
    ===================================================== */

    function stopNonBookMedia() {

        /*
         * VideoViewer.close() and SlideshowViewer.close()
         * have been bridged above.
         *
         * shareClosing === true while this function runs,
         * so the bridge passes through to each viewer's
         * original close implementation.
         */

        if (
            isVideoShare() &&
            window.VideoViewer &&
            typeof VideoViewer.close ===
                "function"
        ) {

            try {

                VideoViewer.close();

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Video close cleanup:",
                    error
                );
            }
        }


        if (
            isSlideshowShare() &&
            window.SlideshowViewer &&
            typeof SlideshowViewer.close ===
                "function"
        ) {

            try {

                SlideshowViewer.close();

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Slideshow close cleanup:",
                    error
                );
            }
        }


        /*
         * Stop any remaining HTML5 media.
         */
        if (mediaHost) {

            mediaHost
                .querySelectorAll(
                    "video, audio"
                )
                .forEach(
                    media => {

                        try {

                            media.pause();

                        }
                        catch (error) {
                            /* ignore */
                        }
                    }
                );
        }


        document
            .querySelectorAll(
                "#videoViewer video, #videoViewer audio"
            )
            .forEach(
                media => {

                    try {

                        media.pause();

                    }
                    catch (error) {
                        /* ignore */
                    }
                }
            );
    }


    /* =====================================================
       BOOK WHEEL / SWIPE NAVIGATION
    ===================================================== */

    function onBookWheel(event) {

        if (!isBookShare()) {
            return;
        }


        /*
         * Ctrl+wheel belongs to zoom.
         */

        if (event.ctrlKey) {
            return;
        }


        /*
         * HARD STOP ON FINAL PAGE
         *
         * This is done directly here, before SRNavigation.next()
         * can be called.
         */
        if (
            event.deltaY > 0 ||
            event.deltaX > 0
        ) {

            const page =
                Number(
                    Reader.currentPage?.()
                ) || 1;


            const pages =
                Number(
                    Reader.pages?.()
                ) || 0;


            if (
                pages > 0 &&
                page >= pages
            ) {

                event.preventDefault();
                event.stopPropagation();


                if (
                    typeof event.stopImmediatePropagation ===
                        "function"
                ) {

                    event.stopImmediatePropagation();
                }


                return;
            }
        }


        if (bookWheelLocked) {
            return;
        }


        if (
            window.SRNavigation &&
            typeof SRNavigation.busy ===
                "function" &&
            SRNavigation.busy()
        ) {
            return;
        }


        if (
            !window.SRNavigation ||
            typeof SRNavigation.next !==
                "function" ||
            typeof SRNavigation.previous !==
                "function"
        ) {
            return;
        }


        bookWheelLocked =
            true;


        setTimeout(
            () => {

                bookWheelLocked =
                    false;

            },
            250
        );


        if (event.deltaY > 0) {

            SRNavigation.next();

        }
        else if (event.deltaY < 0) {

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


    function onBookTouchStart(event) {

        if (!isBookShare()) {

            bookTouchTracking =
                false;

            return;
        }


        if (
            event.touches.length !== 1
        ) {

            bookTouchTracking =
                false;

            return;
        }


        const target =
            event.target;


        if (
            target &&
            target.closest &&
            target.closest(
                "#toolbar, #previousButton, #nextButton, #pageJump, #pageIndicator"
            )
        ) {

            bookTouchTracking =
                false;

            return;
        }


        bookTouchTracking =
            true;


        bookTouchStartX =
            event.touches[0].clientX;


        bookTouchStartY =
            event.touches[0].clientY;
    }


    function onBookTouchMove(event) {

        if (
            !bookTouchTracking ||
            event.touches.length !== 1
        ) {
            return;
        }


        const dx =
            event.touches[0].clientX -
            bookTouchStartX;


        const dy =
            event.touches[0].clientY -
            bookTouchStartY;


        if (
            Math.abs(dx) >
                BOOK_TOUCH_THRESHOLD &&
            Math.abs(dx) >
                Math.abs(dy)
        ) {

            event.preventDefault();
        }
    }


    function onBookTouchEnd(event) {

        if (!bookTouchTracking) {
            return;
        }


        bookTouchTracking =
            false;


        if (!isBookShare()) {
            return;
        }


        if (
            window.SRNavigation &&
            typeof SRNavigation.busy ===
                "function" &&
            SRNavigation.busy()
        ) {
            return;
        }


        const touch =
            event.changedTouches &&
            event.changedTouches[0];


        if (!touch) {
            return;
        }


        const dx =
            touch.clientX -
            bookTouchStartX;


        const dy =
            touch.clientY -
            bookTouchStartY;


        if (
            Math.abs(dx) <
                BOOK_TOUCH_THRESHOLD ||
            Math.abs(dx) <=
                Math.abs(dy)
        ) {
            return;
        }


        if (
            !window.SRNavigation ||
            typeof SRNavigation.next !==
                "function" ||
            typeof SRNavigation.previous !==
                "function"
        ) {
            return;
        }


        bookSuppressClickUntil =
            Date.now() + 500;


        event.preventDefault();


        /*
         * Do not permit a forward swipe past the final page.
         */
        if (dx < 0) {

            const page =
                Number(
                    Reader.currentPage?.()
                ) || 1;


            const pages =
                Number(
                    Reader.pages?.()
                ) || 0;


            if (
                pages > 0 &&
                page >= pages
            ) {

                updatePageButtons();

                return;
            }


            SRNavigation.next();

        }
        else {

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


    function onBookTouchClickCapture(
        event
    ) {

        if (
            Date.now() <
            bookSuppressClickUntil
        ) {

            event.preventDefault();
            event.stopPropagation();

            bookSuppressClickUntil =
                0;
        }
    }


    function bindBookGestures() {

        if (bookGestureBound) {
            return;
        }


        bookGestureBound =
            true;


        bookWheelTarget =
            document.getElementById(
                "viewerArea"
            ) ||
            mediaHost;


        bookTouchTarget =
            mediaHost;


        if (bookWheelTarget) {

            /*
             * passive:false is REQUIRED because the final-page
             * protection may need to call preventDefault().
             */
            bookWheelTarget.addEventListener(
                "wheel",
                onBookWheel,
                {
                    passive: false
                }
            );
        }


        if (bookTouchTarget) {

            bookTouchTarget.addEventListener(
                "touchstart",
                onBookTouchStart,
                {
                    passive: true
                }
            );


            bookTouchTarget.addEventListener(
                "touchmove",
                onBookTouchMove,
                {
                    passive: false
                }
            );


            bookTouchTarget.addEventListener(
                "touchend",
                onBookTouchEnd,
                {
                    passive: false
                }
            );


            bookTouchTarget.addEventListener(
                "click",
                onBookTouchClickCapture,
                true
            );
        }


        if (window.SRNavigation) {

            if (
                typeof SRNavigation.enableWheel ===
                    "function"
            ) {

                SRNavigation.enableWheel(
                    false
                );
            }


            if (
                typeof SRNavigation.enableTouch ===
                    "function"
            ) {

                SRNavigation.enableTouch(
                    false
                );
            }
        }
    }


    function unbindBookGestures() {

        if (!bookGestureBound) {
            return;
        }


        bookGestureBound =
            false;


        if (bookWheelTarget) {

            bookWheelTarget.removeEventListener(
                "wheel",
                onBookWheel
            );
        }


        if (bookTouchTarget) {

            bookTouchTarget.removeEventListener(
                "touchstart",
                onBookTouchStart
            );


            bookTouchTarget.removeEventListener(
                "touchmove",
                onBookTouchMove
            );


            bookTouchTarget.removeEventListener(
                "touchend",
                onBookTouchEnd
            );


            bookTouchTarget.removeEventListener(
                "click",
                onBookTouchClickCapture,
                true
            );
        }


        bookWheelTarget =
            null;


        bookTouchTarget =
            null;


        bookTouchTracking =
            false;


        if (window.SRNavigation) {

            if (
                typeof SRNavigation.enableWheel ===
                    "function"
            ) {

                SRNavigation.enableWheel(
                    true
                );
            }


            if (
                typeof SRNavigation.enableTouch ===
                    "function"
            ) {

                SRNavigation.enableTouch(
                    true
                );
            }
        }
    }


    /* =====================================================
       LAST PAGE PROTECTION
    ===================================================== */

    function bindLastPageProtection() {

        if (!mediaHost) {
            return;
        }


        /*
         * Primary protection at the Share media host.
         */
        if (
            !mediaHost._skyLastPageWheelHandler
        ) {

            mediaHost._skyLastPageWheelHandler =
                function (event) {

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


                    const current =
                        Number(
                            Reader.currentPage()
                        ) || 1;


                    const total =
                        Number(
                            Reader.pages()
                        ) || 0;


                    if (
                        !total ||
                        current < total
                    ) {
                        return;
                    }


                    const forward =
                        event.deltaY > 0 ||
                        event.deltaX > 0;


                    if (!forward) {
                        return;
                    }


                    event.preventDefault();
                    event.stopPropagation();


                    if (
                        typeof event.stopImmediatePropagation ===
                            "function"
                    ) {

                        event.stopImmediatePropagation();
                    }
                };


            mediaHost.addEventListener(
                "wheel",
                mediaHost._skyLastPageWheelHandler,
                {
                    passive: false,
                    capture: true
                }
            );
        }


        /*
         * Secondary protection at document capture phase.
         */
        if (
            !mediaHost._skyLastPageDocumentHandler
        ) {

            mediaHost._skyLastPageDocumentHandler =
                function (event) {

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


                    const current =
                        Number(
                            Reader.currentPage()
                        ) || 1;


                    const total =
                        Number(
                            Reader.pages()
                        ) || 0;


                    if (
                        !total ||
                        current < total
                    ) {
                        return;
                    }


                    const forward =
                        event.deltaY > 0 ||
                        event.deltaX > 0;


                    if (!forward) {
                        return;
                    }


                    event.preventDefault();
                    event.stopPropagation();


                    if (
                        typeof event.stopImmediatePropagation ===
                            "function"
                    ) {

                        event.stopImmediatePropagation();
                    }
                };


            document.addEventListener(
                "wheel",
                mediaHost._skyLastPageDocumentHandler,
                {
                    passive: false,
                    capture: true
                }
            );
        }
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

        
        /*
         * Hide all active item content first.
         */

        hideClosedStateHeader();
        hideSharedItemControls();
        hideSharedItemSurfaces();


        /*
         * Hide any ordinary heading/status content that might
         * otherwise compete with the closed-state button.
         */
        if (titleElement) {

            titleElement.style.setProperty(
                "display",
                "none",
                "important"
            );
        }


        if (subtitleElement) {

            subtitleElement.style.setProperty(
                "display",
                "none",
                "important"
            );
        }


        /*
         * Create the closed panel once.
         */
        if (!closedPanel) {

            closedPanel =
                createElement(
                    "div",
                    "sky-share-closed-panel"
                );


            const main =
                shell.querySelector(
                    ".sky-share-main"
                );


            if (main) {

                /*
                 * Make the main area a stable containing block.
                 */
                if (
                    getComputedStyle(main).position ===
                        "static"
                ) {

                    main.style.setProperty(
                        "position",
                        "relative",
                        "important"
                    );
                }


                main.appendChild(
                    closedPanel
                );
            }
        }


        closedPanel.hidden =
            false;


        /*
         * The panel covers the available main area but its
         * transparent background does NOT block the shell's
         * other controls. Only the image button receives clicks.
         */
        closedPanel.style.setProperty(
            "display",
            "block",
            "important"
        );


        closedPanel.style.setProperty(
            "position",
            "absolute",
            "important"
        );


        closedPanel.style.setProperty(
            "inset",
            "0",
            "important"
        );


        closedPanel.style.setProperty(
            "width",
            "100%",
            "important"
        );


        closedPanel.style.setProperty(
            "height",
            "100%",
            "important"
        );


        closedPanel.style.setProperty(
            "overflow",
            "hidden",
            "important"
        );


        closedPanel.style.setProperty(
            "box-sizing",
            "border-box",
            "important"
        );


        closedPanel.style.setProperty(
            "pointer-events",
            "none",
            "important"
        );


        closedPanel.style.setProperty(
            "z-index",
            "9999",
            "important"
        );


        /*
         * One common Go button for BOOK / VIDEO / SLIDESHOW.
         */
        createClosedGoButton();


        updateClosedGoButtonLayout();
    }


    /* =====================================================
       CLOSED-STATE SHARE HEADER
       
       Universal rule:
       When the shared item is closed and the status/welcome
       surfaces are hidden, the Share header is hidden too.
    ===================================================== */

    function hideClosedStateHeader() {

        if (!shell) {
            return;
        }

        const header =
            shell.querySelector(
                ".sky-share-header"
            );

        if (!header) {
            return;
        }

        header.style.setProperty(
            "display",
            "none",
            "important"
        );

        header.style.setProperty(
            "visibility",
            "hidden",
            "important"
        );

        header.style.setProperty(
            "opacity",
            "0",
            "important"
        );

        header.style.setProperty(
            "pointer-events",
            "none",
            "important"
        );
    }


    function restoreShareHeader() {

        if (!shell) {
            return;
        }

        const header =
            shell.querySelector(
                ".sky-share-header"
            );

        if (!header) {
            return;
        }

        header.style.removeProperty(
            "display"
        );

        header.style.removeProperty(
            "visibility"
        );

        header.style.removeProperty(
            "opacity"
        );

        header.style.removeProperty(
            "pointer-events"
        );
    }



        /* =====================================================
       CLOSE
    ===================================================== */

    function close() {

        /*
         * Ignore duplicate close requests.
         */
        if (shareClosing) {
            return;
        }


        /*
         * There is nothing more to close if the common
         * Share closed state is already active.
         */
        if (
            shell &&
            shell.classList.contains(
                "sky-share-document-closed"
            )
        ) {
            return;
        }


        shareClosing =
            true;


        try {

            stopPageWatcher();

            unbindBookResponsiveRefresh();

            detachBookZoom();

            stopControlsIdleTimer();

            unbindBookGestures();

            exitFullscreen();


            /*
             * FIRST:
             * hide all item-specific controls for every
             * supported shared media type.
             */
            hideSharedItemControls();


            /*
             * Stop Video / Slideshow while shareClosing is true.
             *
             * The viewer close bridges therefore call their
             * original viewer cleanup methods instead of
             * recursively calling ShareViewer.close().
             */
            stopNonBookMedia();


            /*
             * Book cleanup.
             */
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

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Reader close cleanup:",
                    error
                );
            }


            /*
             * Reader.close() may restore normal Reader surfaces.
             * Reapply Share isolation.
             */
            isolateApplication();


            /*
             * Hide standard Reader surfaces.
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
            ].forEach(
                selector => {

                    document
                        .querySelectorAll(
                            selector
                        )
                        .forEach(
                            el => {

                                el.style.setProperty(
                                    "display",
                                    "none",
                                    "important"
                                );

                                el.style.setProperty(
                                    "visibility",
                                    "hidden",
                                    "important"
                                );

                                el.style.setProperty(
                                    "opacity",
                                    "0",
                                    "important"
                                );

                                el.style.setProperty(
                                    "pointer-events",
                                    "none",
                                    "important"
                                );
                            }
                        );
                }
            );


            /*
             * Hide Video surfaces and controls.
             */
            [
                "#videoTopBar",
                "#videoToolbar",
                "#videoControls",
                "#videoViewerControls",
                "#videoPlayerControls",
                ".video-controls",
                ".video-player-controls",
                ".video-control-bar",
                ".video-toolbar"
            ].forEach(
                selector => {

                    document
                        .querySelectorAll(
                            selector
                        )
                        .forEach(
                            el => {

                                el.style.setProperty(
                                    "display",
                                    "none",
                                    "important"
                                );

                                el.style.setProperty(
                                    "visibility",
                                    "hidden",
                                    "important"
                                );

                                el.style.setProperty(
                                    "opacity",
                                    "0",
                                    "important"
                                );

                                el.style.setProperty(
                                    "pointer-events",
                                    "none",
                                    "important"
                                );
                            }
                        );
                }
            );


            /*
             * Hide Slideshow surfaces and controls.
             */
            [
                "#slideshowTopBar",
                "#slideshowToolbar",
                "#slideshowControls",
                "#slideshowViewerControls",
                ".slideshow-top-bar",
                ".slideshow-controls",
                ".slideshow-control-bar",
                ".slideshow-toolbar",
                ".slideshow-buttons"
            ].forEach(
                selector => {

                    document
                        .querySelectorAll(
                            selector
                        )
                        .forEach(
                            el => {

                                el.style.setProperty(
                                    "display",
                                    "none",
                                    "important"
                                );

                                el.style.setProperty(
                                    "visibility",
                                    "hidden",
                                    "important"
                                );

                                el.style.setProperty(
                                    "opacity",
                                    "0",
                                    "important"
                                );

                                el.style.setProperty(
                                    "pointer-events",
                                    "none",
                                    "important"
                                );
                            }
                        );
                }
            );


            /*
             * Hide the welcome banner.
             */
            document
                .querySelectorAll(
                    ".sr-welcome-banner"
                )
                .forEach(
                    el => {

                        el.style.setProperty(
                            "display",
                            "none",
                            "important"
                        );

                        el.style.setProperty(
                            "visibility",
                            "hidden",
                            "important"
                        );
                    }
                );


            /*
             * Hide the actual mounted media surface.
             */
            hideSharedItemSurfaces();


            /*
             * ONE common closed state for:
             *
             *   Book
             *   Video
             *   Slideshow
             */
            showClosedPanel();

        }
        catch (error) {

            console.error(
                "[SkyMedia Share] Close cleanup:",
                error
            );

        }
        finally {

            shareClosing =
                false;
        }
    }


    /* =====================================================
       CONTROLS IDLE TIMEOUT
       10 SECONDS
    ===================================================== */

    const CONTROLS_IDLE_MS =
        10000;


    function showControls() {

        document.body.classList.remove(
            "sky-share-controls-hidden"
        );
    }


    function scheduleControlsHide() {

        if (controlsIdleTimer) {

            clearTimeout(
                controlsIdleTimer
            );
        }


        controlsIdleTimer =
            setTimeout(
                () => {

                    controlsIdleTimer =
                        null;


                    /*
                     * Never hide the closed-state Go button.
                     * This class only affects normal Share controls.
                     */
                    if (
                        !shell ||
                        !shell.classList.contains(
                            "sky-share-document-closed"
                        )
                    ) {

                        document.body.classList.add(
                            "sky-share-controls-hidden"
                        );
                    }

                },
                CONTROLS_IDLE_MS
            );
    }


    function registerControlsActivity() {

        if (
            !document.body.classList.contains(
                "sky-share-mode"
            )
        ) {
            return;
        }


        showControls();

        scheduleControlsHide();
    }


    function bindControlsIdleTimer() {

        if (controlsActivityBound) {

            registerControlsActivity();

            return;
        }


        controlsActivityBound =
            true;


        [
            "pointerdown",
            "pointermove",
            "mousemove",
            "touchstart",
            "keydown",
            "wheel"
        ].forEach(
            type => {

                document.addEventListener(
                    type,
                    registerControlsActivity,
                    {
                        passive: true
                    }
                );
            }
        );


        registerControlsActivity();
    }


    function stopControlsIdleTimer() {

        if (controlsIdleTimer) {

            clearTimeout(
                controlsIdleTimer
            );


            controlsIdleTimer =
                null;
        }


        showControls();
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
                    event.key !==
                    "Escape"
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


                /*
                 * Escape can close any shared item, not only books.
                 */
                if (
                    shell &&
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


        if (mediaHost) {

    mediaHost.style.setProperty(
        "width",
        "100%",
        "important"
    );

    mediaHost.style.setProperty(
        "height",
        "100%",
        "important"
    );

    mediaHost.style.setProperty(
        "min-width",
        "0",
        "important"
    );

    mediaHost.style.setProperty(
        "min-height",
        "0",
        "important"
    );

    mediaHost.style.setProperty(
        "box-sizing",
        "border-box",
        "important"
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


        await Reader.open(
            item
        );


        moveIntoShareHost(
            viewer
        );


        viewer.classList.add(
            "sky-share-mounted-viewer"
        );


        const toolbar =
            document.getElementById(
                "toolbar"
            );


        if (toolbar) {

            moveIntoShareHost(
                toolbar
            );
        }


        const status =
            document.getElementById(
                "statusBar"
            );


        if (status) {

            moveIntoShareHost(
                status
            );


            status.hidden =
                false;


            status.removeAttribute(
                "aria-hidden"
            );


            status.style.removeProperty(
                "visibility"
            );


            status.style.removeProperty(
                "opacity"
            );


            status.style.removeProperty(
                "display"
            );


            const readerTitle =
                document.getElementById(
                    "readerTitle"
                );


            if (readerTitle) {

                readerTitle.hidden =
                    false;


                readerTitle.removeAttribute(
                    "aria-hidden"
                );


                readerTitle.style.removeProperty(
                    "display"
                );


                readerTitle.style.removeProperty(
                    "visibility"
                );


                readerTitle.style.removeProperty(
                    "opacity"
                );
            }


            const pageIndicator =
                document.getElementById(
                    "pageIndicator"
                );


            if (pageIndicator) {

                pageIndicator.hidden =
                    false;


                pageIndicator.removeAttribute(
                    "aria-hidden"
                );


                pageIndicator.style.removeProperty(
                    "display"
                );


                pageIndicator.style.removeProperty(
                    "visibility"
                );


                pageIndicator.style.removeProperty(
                    "opacity"
                );
            }


            const pageJump =
                document.getElementById(
                    "pageJump"
                );


            if (pageJump) {

                pageJump.style.removeProperty(
                    "display"
                );


                pageJump.style.removeProperty(
                    "visibility"
                );
            }
        }


        const welcome =
            document.querySelector(
                ".sr-welcome-banner"
            );


        if (welcome) {

            moveIntoShareHost(
                welcome
            );
        }


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

                SRNavigation.setCurrentBook(
                    item
                );
            }
        }


        bindBookControls();

        bindLastPageProtection();


        updateMuteIcon();

        updatePageButtons();


        if (
            typeof window.updatePageIndicator ===
                "function"
        ) {

            window.updatePageIndicator();
        }


        updateShareBookIndicator();


        requestAnimationFrame(
            () => {

                if (
                    window.Reader &&
                    typeof Reader.refresh ===
                        "function"
                ) {

                    Reader.refresh();
                }


                updatePageButtons();

                updateShareBookIndicator();
            }
        );


        attachBookZoom();


        setTimeout(
            attachBookZoom,
            150
        );


        setTimeout(
            attachBookZoom,
            600
        );


        bindBookGestures();

        bindBookResponsiveRefresh();
    }


    /* =====================================================
       BOOK ZOOM
    ===================================================== */

    function attachBookZoom() {

        if (!window.SkyMediaZoom) {
            return;
        }


        const viewer =
            document.getElementById(
                "viewerArea"
            );


        if (!viewer) {
            return;
        }


        const target =
            viewer.querySelector(
                ".stf__parent"
            ) ||
            document.getElementById(
                "pageContainer"
            ) ||
            viewer;


        if (
            bookZoomController &&
            bookZoomTarget === target
        ) {

            return;
        }


        if (bookZoomController) {

            bookZoomController.destroy();

            bookZoomController =
                null;
        }


        bookZoomController =
            SkyMediaZoom.create(
                viewer
            );


        bookZoomController.setTarget(
            target
        );


        bookZoomTarget =
            target;
    }


    function detachBookZoom() {

        if (bookZoomController) {

            bookZoomController.destroy();

            bookZoomController =
                null;

            bookZoomTarget =
                null;
        }
    }

    /* =====================================================
       VIDEO / SLIDESHOW CLOSE BRIDGES

       Reader close is ShareViewer-owned.

       Video and Slideshow have their own viewer-owned
       close paths, so bridge those paths back into the
       common Share closed-state handler.
    ===================================================== */

    function bindViewerCloseBridges() {

        /*
         * VIDEO
         */
        if (
            window.VideoViewer &&
            typeof VideoViewer.close ===
                "function"
        ) {

            if (
                !VideoViewer._skyShareOriginalClose
            ) {

                const originalClose =
                    VideoViewer.close;


                VideoViewer._skyShareOriginalClose =
                    originalClose;


                VideoViewer.close =
                    function (...args) {

                        /*
                         * When Share Mode owns a video,
                         * its normal viewer close must become
                         * ShareViewer.close().
                         */
                        if (
                            started &&
                            isVideoShare() &&
                            !shareClosing &&
                            !shell?.classList.contains(
                                "sky-share-document-closed"
                            )
                        ) {

                            close();

                            return;
                        }


                        /*
                         * During ShareViewer.close(), permit
                         * the real viewer cleanup to run.
                         */
                        return originalClose.apply(
                            this,
                            args
                        );
                    };
            }
        }


        /*
         * SLIDESHOW
         */
        if (
            window.SlideshowViewer &&
            typeof SlideshowViewer.close ===
                "function"
        ) {

            if (
                !SlideshowViewer._skyShareOriginalClose
            ) {

                const originalClose =
                    SlideshowViewer.close;


                SlideshowViewer._skyShareOriginalClose =
                    originalClose;


                SlideshowViewer.close =
                    function (...args) {

                        if (
                            started &&
                            isSlideshowShare() &&
                            !shareClosing &&
                            !shell?.classList.contains(
                                "sky-share-document-closed"
                            )
                        ) {

                            close();

                            return;
                        }


                        return originalClose.apply(
                            this,
                            args
                        );
                    };
            }
        }
    }


    function bindMediaCloseClickBridge() {

        if (mediaCloseClickBound) {
            return;
        }


        mediaCloseClickBound =
            true;


        document.addEventListener(
            "click",
            function (event) {

                if (!started) {
                    return;
                }


                if (shareClosing) {
                    return;
                }


                if (
                    shell &&
                    shell.classList.contains(
                        "sky-share-document-closed"
                    )
                ) {
                    return;
                }


                /*
                 * Only Video and Slideshow need this bridge.
                 */
                if (
                    !isVideoShare() &&
                    !isSlideshowShare()
                ) {
                    return;
                }


                const target =
                    event.target;


                if (
                    !target ||
                    !target.closest
                ) {
                    return;
                }


                const button =
                    target.closest(
                        "button, a, [role='button'], [data-action]"
                    );


                if (!button) {
                    return;
                }


                /*
                 * Examine the common ways close buttons
                 * identify themselves.
                 */
                const metadata =
                    [
                        button.id,
                        button.className,
                        button.getAttribute(
                            "aria-label"
                        ),
                        button.getAttribute(
                            "title"
                        ),
                        button.getAttribute(
                            "data-action"
                        )
                    ]
                    .filter(Boolean)
                    .join(" ");


                /*
                 * Do not mistake fullscreen controls for
                 * the document-close control.
                 */
                if (
                    /fullscreen/i.test(
                        metadata
                    )
                ) {
                    return;
                }


                /*
                 * Catch close controls even when the viewer
                 * doesn't expose a close() API.
                 */
                if (
                    !/close/i.test(
                        metadata
                    )
                ) {
                    return;
                }


                event.preventDefault();
                event.stopPropagation();


                if (
                    typeof event.stopImmediatePropagation ===
                        "function"
                ) {

                    event.stopImmediatePropagation();
                }


                close();

            },
            true
        );
    }



    /* =====================================================
       RESPONSIVE BOOK REFRESH

       Share Mode can change the effective viewport after the
       Reader/PageFlip engine has already calculated its size.

       This handles:
         • Browser resize
         • DevTools opening/closing
         • Window maximization
         • Mobile visual viewport changes
         • Share container size changes
         • Delayed layout changes after Share Mode starts
    ===================================================== */

    function scheduleBookResponsiveRefresh(
        delay = 0
    ) {

        if (!isBookShare()) {
            return;
        }


        if (
            shell &&
            shell.classList.contains(
                "sky-share-document-closed"
            )
        ) {
            return;
        }


        if (
            !window.Reader ||
            typeof Reader.refresh !==
                "function"
        ) {
            return;
        }


        if (bookResizeTimer) {

            clearTimeout(
                bookResizeTimer
            );

            bookResizeTimer =
                null;
        }


        bookResizeTimer =
            setTimeout(
                function () {

                    bookResizeTimer =
                        null;


                    if (
                        bookResizeRaf
                    ) {

                        cancelAnimationFrame(
                            bookResizeRaf
                        );
                    }


                    /*
                     * Wait until the browser has completed
                     * the current layout pass.
                     */
                    bookResizeRaf =
                        requestAnimationFrame(
                            function () {

                                bookResizeRaf =
                                    0;


                                if (
                                    !isBookShare() ||
                                    (
                                        shell &&
                                        shell.classList.contains(
                                            "sky-share-document-closed"
                                        )
                                    )
                                ) {
                                    return;
                                }


                                try {

                                    Reader.refresh();

                                }
                                catch (error) {

                                    console.warn(
                                        "[SkyMedia Share] Responsive Reader refresh:",
                                        error
                                    );
                                }


                                updatePageButtons();

                                updateShareBookIndicator();

                            }
                        );

                },
                delay
            );
    }


    function bindBookResponsiveRefresh() {

        if (bookResponsiveRefreshBound) {

            /*
             * Still trigger an immediate reflow for the
             * current viewport.
             */
            scheduleBookResponsiveRefresh();

            return;
        }


        bookResponsiveRefreshBound =
            true;


        /*
         * -------------------------------------------------
         * Browser/window resize
         *
         * This catches DevTools opening/closing, maximizing,
         * restoring, resizing the browser, etc.
         * -------------------------------------------------
         */
        window.addEventListener(
            "resize",
            function () {

                scheduleBookResponsiveRefresh(
                    30
                );

            },
            {
                passive: true
            }
        );


        /*
         * -------------------------------------------------
         * Visual viewport resize
         *
         * Especially useful on mobile browsers and situations
         * where the layout viewport itself is not the first
         * thing to change.
         * -------------------------------------------------
         */
        if (
            window.visualViewport
        ) {

            window.visualViewport.addEventListener(
                "resize",
                function () {

                    scheduleBookResponsiveRefresh(
                        30
                    );

                },
                {
                    passive: true
                }
            );
        }


        /*
         * -------------------------------------------------
         * ResizeObserver
         *
         * This is the important part for Share Mode because
         * the actual Reader container can change size without
         * a traditional window resize being sufficient.
         * -------------------------------------------------
         */
        if (
            typeof ResizeObserver ===
                "function"
        ) {

            bookResizeObserver =
                new ResizeObserver(
                    function () {

                        scheduleBookResponsiveRefresh(
                            20
                        );

                    }
                );


            const viewer =
                document.getElementById(
                    "viewerArea"
                );


            if (viewer) {

                bookResizeObserver.observe(
                    viewer
                );
            }


            if (mediaHost) {

                bookResizeObserver.observe(
                    mediaHost
                );
            }


            if (shell) {

                const main =
                    shell.querySelector(
                        ".sky-share-main"
                    );


                if (main) {

                    bookResizeObserver.observe(
                        main
                    );
                }
            }
        }


        /*
         * Initial layout passes.
         *
         * These are intentionally staggered because PageFlip,
         * Share Mode, and the browser layout engine do not all
         * settle on the same animation frame.
         */
        scheduleBookResponsiveRefresh(
            0
        );


        scheduleBookResponsiveRefresh(
            100
        );


        scheduleBookResponsiveRefresh(
            300
        );


        scheduleBookResponsiveRefresh(
            700
        );
    }


    function unbindBookResponsiveRefresh() {

        if (
            bookResizeTimer
        ) {

            clearTimeout(
                bookResizeTimer
            );

            bookResizeTimer =
                null;
        }


        if (
            bookResizeRaf
        ) {

            cancelAnimationFrame(
                bookResizeRaf
            );

            bookResizeRaf =
                0;
        }


        if (
            bookResizeObserver
        ) {

            bookResizeObserver.disconnect();

            bookResizeObserver =
                null;
        }
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


        moveIntoShareHost(
            viewer
        );


        if (
            !window.VideoViewer ||
            typeof VideoViewer.openVideo !==
                "function"
        ) {

            throw new Error(
                "Share Mode: VideoViewer.openVideo() unavailable."
            );
        }


                await VideoViewer.openVideo(
            item
        );


        /*
         * Video is now open and its own viewer has
         * established its controls. Bridge its close
         * path into ShareViewer.
         */
        bindViewerCloseBridges();
        bindMediaCloseClickBridge();
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


        moveIntoShareHost(
            viewer
        );


                await SlideshowViewer.open(
            item
        );


        /*
         * Slideshow is now open and its own viewer has
         * established its controls. Bridge its close
         * path into ShareViewer.
         */
        bindViewerCloseBridges();
        bindMediaCloseClickBridge();
    }


    /* =====================================================
       OPEN ITEM
    ===================================================== */

    async function openItem(
        item,
        target
    ) {

        const section =
            String(
                target.section ||
                item.type ||
                ""
            ).toLowerCase();


        activeItem =
            item;


        activeTarget =
            target;


        document.body.classList.toggle(
            "sky-share-book",
            section === "reader" ||
            section === "book"
        );


        /*
         * Opening a new item means the closed state must disappear.
         */
        if (closedPanel) {

            closedPanel.hidden =
                true;


            closedPanel.style.setProperty(
                "display",
                "none",
                "important"
            );
        }


        if (mediaHost) {

            mediaHost.style.removeProperty(
                "display"
            );

            mediaHost.style.removeProperty(
                "visibility"
            );

            mediaHost.style.removeProperty(
                "opacity"
            );

            mediaHost.style.removeProperty(
                "pointer-events"
            );
        }


        if (titleElement) {

            titleElement.style.removeProperty(
                "display"
            );
        }


        if (subtitleElement) {

            subtitleElement.style.removeProperty(
                "display"
            );
        }


        if (statusElement) {

            statusElement.style.removeProperty(
                "display"
            );

            statusElement.style.removeProperty(
                "visibility"
            );

            statusElement.style.removeProperty(
                "opacity"
            );
        }


        shell.classList.remove(
            "sky-share-document-closed"
        );

        restoreShareHeader();

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
                sectionLabel(
                    section
                );
        }


        statusElement.textContent =
            "Opening " +
            sectionLabel(
                section
            ).toLowerCase() +
            "…";


        if (section === "video") {

            await prepareVideo(
                item
            );

        }
        else if (
            section === "slideshow" ||
            section === "slides"
        ) {

            await prepareSlideshow(
                item
            );

        }
        else if (
            section === "reader" ||
            section === "book"
        ) {

            await prepareBook(
                item
            );

        }
        else {

            throw new Error(
                "Unsupported Share Mode section: " +
                section
            );
        }


        if (
            !isBookShare() &&
            statusElement
        ) {

            statusElement.textContent =
                "";
        }
    }


    /* =====================================================
       START
    ===================================================== */

    async function start(
        item,
        target
    ) {

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


        started =
            true;


        activeItem =
            item;


        activeTarget =
            target;


        try {

            createShell();


            bindEscape();

            bindFullscreenChange();

            bindLastPageProtection();


            await openItem(
                item,
                target
            );


            isolateApplication();


            /*
             * Reassert Reader status after the normal application
             * has been isolated.
             */
            if (isBookShare()) {

                const status =
                    document.getElementById(
                        "statusBar"
                    );


                if (status) {

                    status.hidden =
                        false;


                    status.removeAttribute(
                        "aria-hidden"
                    );


                    status.style.removeProperty(
                        "display"
                    );


                    status.style.removeProperty(
                        "visibility"
                    );


                    status.style.removeProperty(
                        "opacity"
                    );
                }


                updatePageButtons();

                updateShareBookIndicator();
    /*
     * The complete Share layout now exists.
     *
     * Start responsive monitoring AFTER isolation so the
     * Reader/PageFlip engine measures the real Share viewport.
     */
                bindBookResponsiveRefresh();

            }


            /*
             * Video/slideshow are intentionally left alone here;
             * their visible controls remain available while open.
             */
            bindControlsIdleTimer();


            shell.style.zIndex =
                "999999";


        }
        catch (error) {

            started =
                false;


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