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
 • Existing small bottom-right Open Meditation Mornings
   button is unchanged.
 • A separate large assets/go-button.png image is centered.
 • Large image links to Meditation Mornings.
 • Large image preserves its own aspect ratio.
 • CSS controls its responsive size and floating animation.
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

    let bookZoomController = null;
    let bookZoomTarget = null;

    let controlsIdleTimer = null;
    let controlsActivityBound = false;

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


        /*
         * The normal Reader title element.
         */
        const readerTitle =
            document.getElementById(
                "readerTitle"
            );


        /*
         * Get the authoritative Reader book.
         */
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
         * ---------------------------------------------------
         * TITLE
         *
         * Keep the title completely separate from the
         * page-number indicator.
         * ---------------------------------------------------
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


        /*
        -------------------------------------------------------
         Preserve the Reader's established spread label.
        -------------------------------------------------------
        */

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
         IMPORTANT

         #pageIndicator contains ONLY:

             2–3 / 24

         It does NOT contain the title.
        -------------------------------------------------------
        */

        indicator.textContent =
            label +
            " / " +
            (pages || "");


        /*
        -------------------------------------------------------
         Restore the actual Reader indicator after the
         Reader status bar has been moved into Share Mode.
        -------------------------------------------------------
        */

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

    function createClosedGoButton() {
    if (!closedPanel) return null;

    let button = closedPanel.querySelector(".sky-share-closed-go-button");

    if (button) {
        return button;
    }

    button = document.createElement("a");
    button.className = "sky-share-closed-go-button";

    button.href = GLIDE_MEDIA_URL;
    button.target = "_blank";
    button.rel = "noopener noreferrer";

    button.setAttribute(
        "aria-label",
        "Open Meditation Mornings"
    );

    /*
     * The button is positioned inside the closed panel.
     *
     * Change these two values to move it:
     *
     *   --sky-go-x: 50%;
     *   --sky-go-y: 50%;
     *
     * Examples:
     *
     *   50% 50% = center
     *   50% 60% = lower
     *   50% 40% = higher
     *   60% 50% = right
     *   40% 50% = left
     */
    button.style.setProperty("--sky-go-x", "50%");
    button.style.setProperty("--sky-go-y", "50%");

    button.style.setProperty(
        "position",
        "absolute",
        "important"
    );

    button.style.setProperty(
        "left",
        "var(--sky-go-x)",
        "important"
    );

    button.style.setProperty(
        "top",
        "var(--sky-go-y)",
        "important"
    );

    button.style.setProperty(
        "transform",
        "translate(-50%, -50%)",
        "important"
    );

    /*
     * Significantly larger than the previous 520px maximum.
     */
    button.style.setProperty(
        "width",
        "min(75vw, 1000px)",
        "important"
    );

    button.style.setProperty(
        "max-width",
        "75vw",
        "important"
    );

    button.style.setProperty(
        "max-height",
        "75vh",
        "important"
    );

    button.style.setProperty(
        "height",
        "auto",
        "important"
    );

    button.style.setProperty(
        "margin",
        "0",
        "important"
    );

    button.style.setProperty(
        "padding",
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
        "overflow",
        "hidden",
        "important"
    );

    button.style.setProperty(
        "z-index",
        "10000",
        "important"
    );

    button.style.setProperty(
        "pointer-events",
        "auto",
        "important"
    );

    const image = document.createElement("img");

    image.src = new URL(
        "/assets/go-button.png",
        window.location.origin
    ).href;

    image.alt = "Open Meditation Mornings";
    image.draggable = false;

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
        "75vh",
        "important"
    );

    image.style.setProperty(
        "object-fit",
        "contain",
        "important"
    );

    /*
     * The anchor handles the click.
     * The image deliberately does not intercept it.
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

    button.appendChild(image);
    closedPanel.appendChild(button);

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


        /*
        -------------------------------------------------------
         Reuse existing primary logo.
        -------------------------------------------------------
        */

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


        /*
         * Keep title and page information synchronized.
         */
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


        /*
         * Replace Reader buttons before rearranging them.
         */

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


        /*
         * Rotate and bookmark deliberately removed.
         */

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


        /*
         * Previous / Next become independent controls.
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
         * Toolbar contains ONLY:
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


        /*
         * Pinch / two-finger gestures belong to zoom.
         */

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


        /*
         * Ignore vertical movement.
         */

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


        /*
         * Stop synthesized click after successful swipe.
         */

        bookSuppressClickUntil =
            Date.now() + 500;


        event.preventDefault();


        if (dx < 0) {

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

            bookWheelTarget.addEventListener(
                "wheel",
                onBookWheel,
                {
                    passive: true
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
    if (!shell) return;

    shell.classList.add("sky-share-document-closed");

    /*
     * Create the panel before creating the Go button.
     */
    if (!closedPanel) {
        closedPanel = createElement(
            "div",
            "sky-share-closed-panel"
        );

        const main = shell.querySelector(".sky-share-main");

        if (main) {
            main.appendChild(closedPanel);
        }
    }

    closedPanel.hidden = false;

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
        "max-width",
        "100%",
        "important"
    );

    closedPanel.style.setProperty(
        "max-height",
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
        "auto",
        "important"
    );

    /*
     * Create the actual image button.
     */
    createClosedGoButton();
}


    /* =====================================================
       CLOSE
    ===================================================== */

    function close() {

        stopPageWatcher();

        detachBookZoom();

        stopControlsIdleTimer();

        unbindBookGestures();

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

        }
        catch (error) {

            console.warn(
                "[SkyMedia Share] Reader close cleanup:",
                error
            );
        }


        /*
         * Reader.close() normally restores Reader landing.
         * Share Mode immediately reasserts its isolation.
         */

        isolateApplication();


        /*
         * Hide normal Reader surfaces that Reader.close()
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
                        }
                    );
            }
        );


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
                }
            );


        /*
         * Share shell remains visible.
         *
         * showClosedPanel() creates the large image button.
         */

        showClosedPanel();
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


                    document.body.classList.add(
                        "sky-share-controls-hidden"
                    );

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
         * Open through existing Reader.
         */

        await Reader.open(
            item
        );


        /*
         * Move live Reader surface into Share Mode.
         */

        moveIntoShareHost(
            viewer
        );


        viewer.classList.add(
            "sky-share-mounted-viewer"
        );


        /*
         * Move Reader toolbar into Share Mode.
         */

        const toolbar =
            document.getElementById(
                "toolbar"
            );


        if (toolbar) {

            moveIntoShareHost(
                toolbar
            );
        }


        /*
         * Move REAL Reader status bar.
         */

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


            /*
             * Explicitly restore title and page indicator.
             */

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


        /*
         * Welcome remains immediately below status.
         */

        const welcome =
            document.querySelector(
                ".sr-welcome-banner"
            );


        if (welcome) {

            moveIntoShareHost(
                welcome
            );
        }


        /*
         * Tell SRNavigation which book Share Mode owns.
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

                SRNavigation.setCurrentBook(
                    item
                );
            }
        }


        bindBookControls();

        bindLastPageProtection();


        updateMuteIcon();

        updatePageButtons();


        /*
         * Normal Reader UI refresh.
         */

        if (
            typeof window.updatePageIndicator ===
                "function"
        ) {

            window.updatePageIndicator();
        }


        /*
         * Share Mode now restores BOTH:
         *
         *   title
         *   page indicator
         */

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


        /*
         * Existing SkyMediaZoom controller.
         */

        attachBookZoom();


        setTimeout(
            attachBookZoom,
            150
        );


        setTimeout(
            attachBookZoom,
            600
        );


        /*
         * Share Mode wheel and touch navigation.
         */

        bindBookGestures();
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


        moveIntoShareHost(
            viewer
        );


        await SlideshowViewer.open(
            item
        );
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


        /*
         * Book-specific Share CSS.
         */

        document.body.classList.toggle(
            "sky-share-book",
            section === "reader" ||
            section === "book"
        );


        /*
         * Share header title.
         */

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


        /*
         * Book Share uses REAL Reader status bar.
         *
         * Video and slideshow continue using their own
         * status systems.
         */

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


            /*
             * Hide normal application only AFTER the shared
             * item has successfully opened.
             */

            isolateApplication();


            /*
             * Reader status bar and page indicator were moved
             * outside #workspace. Reassert them after isolation.
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


                /*
                 * IMPORTANT:
                 *
                 * This restores BOTH the title and the page
                 * indicator.
                 */

                updatePageButtons();

                updateShareBookIndicator();
            }


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