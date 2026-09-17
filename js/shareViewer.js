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
 • Existing Reader page indicator is preserved and explicitly
   synchronized by Share Mode after the Reader surface is moved.
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
       SHARE BOOK PAGE INDICATOR

       The normal Reader already owns #pageIndicator and
       ui.js already knows how to calculate spread labels.

       Share Mode moves #statusBar out of its original Reader
       location. That can interfere with the normal UI timing.

       Therefore Share Mode explicitly reasserts the existing
       Reader indicator after mounting and while navigating.

       IMPORTANT:
       We do NOT create a second page-count element.

       The actual Reader #pageIndicator remains the source of
       truth.
    ===================================================== */

    function updateShareBookIndicator() {

    if (!isBookShare()) {
        return;
    }

    if (
        !window.Reader ||
        typeof Reader.currentPage !== "function" ||
        typeof Reader.pages !== "function"
    ) {
        return;
    }

    const indicator =
        document.getElementById("pageIndicator");

    if (!indicator) {
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


    /*
     * Let the normal Reader UI calculate its established
     * spread information first.
     */
    if (
        typeof window.updatePageIndicator ===
            "function"
    ) {

        try {

            window.updatePageIndicator();

        } catch (error) {

            console.warn(
                "[SkyMedia Share] Reader page indicator refresh:",
                error
            );
        }
    }


    /*
     * Preserve the Reader's existing spread label.
     *
     * Examples:
     *
     *     1
     *     2–3
     *     4–5
     *     6
     */
    let label = "";


    if (
        typeof Reader.spread === "function"
    ) {

        try {

            const spread =
                Reader.spread();

            if (
                spread &&
                spread.label !== undefined &&
                spread.label !== null
            ) {

                label =
                    String(
                        spread.label
                    ).trim();
            }

        } catch (error) {

            console.warn(
                "[SkyMedia Share] Reader spread lookup:",
                error
            );
        }
    }


    if (!label) {
        label = String(page);
    }


    /*
     * Include the actual book title so Share Book has the same
     * title + page information presentation as the other viewers.
     */
    const book =
        window.Reader &&
        typeof Reader.book === "function"
            ? Reader.book()
            : null;


    const title =
        String(
            book?.title ||
            activeItem?.title ||
            ""
        ).trim();


    const pageText =
        label +
        " / " +
        (pages || "");


    /*
 * Title remains outside the page-number indicator.
 * The indicator itself contains only the page numbers.
 */
if (title) {
    indicator.innerHTML =
        '<span class="sky-share-page-title">' +
        title.replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[char];
        }) +
        '</span>' +
        '<span class="sky-share-page-count">' +
        pageText +
        '</span>';
} else {
    indicator.innerHTML =
        '<span class="sky-share-page-count">' +
        pageText +
        '</span>';
}


    /*
     * Explicitly restore the actual Reader indicator after
     * Share Mode reparents #statusBar.
     */
    indicator.hidden = false;

    indicator.removeAttribute(
        "aria-hidden"
    );

    indicator.tabIndex = 0;

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


        /*
         * Reuse the existing primary logo from index.html.
         * Move the existing element into the Share shell so it
         * remains visible when #workspace is isolated.
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
         * Persistent bottom-right Share button.
         *
         * This is separate from the central closed-state button
         * created later by showClosedPanel().
         */
        const actions = createElement(
            "div",
            "sky-share-actions"
        );

        const openButton = createElement(
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


        const closeButton = createElement(
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

        if (!element || !mediaHost) {
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
            document.getElementById(id);

        if (!oldButton) {
            return null;
        }

        const newButton =
            oldButton.cloneNode(true);

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


        const muted = !!(
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
         * Keep page information synchronized at the same time
         * as Previous / Next state.
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


        bookControlsBound = true;


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
         * Rotate and bookmark are deliberately removed.
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
         * Previous and Next become independent controls.
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
         * Toolbar now contains ONLY:
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
                     * Existing KV / short-link implementation.
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
       BOOK WHEEL / SWIPE NAVIGATION
    ===================================================== */

    function onBookWheel(event) {

        if (!isBookShare()) {
            return;
        }


        /*
         * Ctrl+wheel belongs to the zoom controller.
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


        bookWheelLocked = true;


        setTimeout(
            () => {

                bookWheelLocked = false;

            },
            250
        );


        if (event.deltaY > 0) {

            SRNavigation.next();

        } else if (event.deltaY < 0) {

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

            bookTouchTracking = false;

            return;
        }


        /*
         * Pinch / two-finger gestures belong to zoom.
         */
        if (event.touches.length !== 1) {

            bookTouchTracking = false;

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

            bookTouchTracking = false;

            return;
        }


        bookTouchTracking = true;

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


        bookTouchTracking = false;


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
         * Stop the synthesized click after a successful swipe.
         */
        bookSuppressClickUntil =
            Date.now() + 500;


        event.preventDefault();


        if (dx < 0) {

            SRNavigation.next();

        } else {

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


    function onBookTouchClickCapture(event) {

        if (
            Date.now() <
            bookSuppressClickUntil
        ) {

            event.preventDefault();
            event.stopPropagation();

            bookSuppressClickUntil = 0;
        }
    }


    function bindBookGestures() {

        if (bookGestureBound) {
            return;
        }


        bookGestureBound = true;


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


        bookGestureBound = false;


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


        bookWheelTarget = null;
        bookTouchTarget = null;
        bookTouchTracking = false;


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


            /*
             * SECOND central button.
             */
            const centerButton =
                createElement(
                    "a",
                    "sky-share-closed-open-button",
                    "Open Meditation Mornings"
                );


            centerButton.href =
                GLIDE_MEDIA_URL;


            centerButton.target =
                "_blank";


            centerButton.rel =
                "noopener noreferrer";


            closedPanel.appendChild(
                centerButton
            );


            shell
                .querySelector(
                    ".sky-share-main"
                )
                ?.appendChild(
                    closedPanel
                );
        }


        closedPanel.hidden =
            false;


        closedPanel.style.display =
            "flex";
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

        } catch (error) {

            console.warn(
                "[SkyMedia Share] Reader close cleanup:",
                error
            );
        }


        /*
         * Reader.close() normally restores Reader landing.
         * Share Mode must immediately reassert its own isolation.
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


        controlsActivityBound = true;


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

            controlsIdleTimer = null;
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
         * Open through the existing Reader first.
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
         * Move the REAL Reader status bar.
         *
         * We do not create another page counter.
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

                /*
                 * ui.js continues to own its actual open/closed
                 * state.
                 */
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
         * Let the normal Reader UI refresh its own indicator,
         * then Share Mode explicitly reasserts it.
         */
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
         * Book-specific Share CSS depends on this class.
         */
        document.body.classList.toggle(
            "sky-share-book",
            section === "reader" ||
            section === "book"
        );


        /*
         * Share heading title.
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
         * Book Share uses the REAL Reader #statusBar.
         *
         * Video and slideshow continue using their own status
         * systems.
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


        started = true;


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
             * outside #workspace. Reassert them after isolation
             * because some existing Reader UI code may have run
             * between Reader.open() and this point.
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
                 * Call the LOCAL Share helper, not a nonexistent
                 * global updatePageButtons().
                 */
                updatePageButtons();

                updateShareBookIndicator();
            }


            bindControlsIdleTimer();


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