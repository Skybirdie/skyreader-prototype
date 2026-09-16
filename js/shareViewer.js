"use strict";

/*

SkyMedia Share Viewer
Share Mode — clean book implementation

Book Share Mode:
• Opens exactly one shared book.
• Reuses Reader / Renderer / Sky180FlipEngine.
• Reuses the existing Reader controls.
• Rotate is intentionally unavailable.
• Previous / Next remain at the page edges.
• Mute uses AudioController + the normal Reader icon state.
• Share uses ShareManager so the existing short-link/KV system
is preserved.
• Fullscreen uses the Share Viewer shell.
• X closes the document but remains in Share Mode and displays
the large "Open Meditation Mornings" button.
• Normal Reader / Library / Landing / App navigation remains hidden.

IMPORTANT:
Normal Reader behavior is not modified.
All Share-specific event handling is scoped to body.sky-share-mode.
===================================================================

*/

window.ShareViewer = (function () {


let started = false;
let activeItem = null;
let activeTarget = null;

let shell = null;
let titleElement = null;
let subtitleElement = null;
let sectionElement = null;
let mediaHost = null;
let openButton = null;
let closeButton = null;
let statusElement = null;
let closedPanel = null;

let mountedBookElements = [];
let wheelLocked = false;

const GLIDE_MEDIA_URL =
    "https://meditationmornings.glide.page/dl/media";


/* =========================================================
   UTILITIES
========================================================= */

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


function isBookShare() {

    const section =
        String(activeTarget?.section || activeItem?.type || "")
            .trim()
            .toLowerCase();

    return (
        section === "reader" ||
        section === "book"
    );
}


/* =========================================================
   SHELL
========================================================= */

function createShell() {

    if (shell) {
        return;
    }

    shell = createElement(
        "div",
        "sky-share-shell"
    );

    shell.id = "skyShareShell";


    /* -----------------------------------------------------
       Share header
    ----------------------------------------------------- */

    const header = createElement(
        "header",
        "sky-share-header"
    );

    const brand = createElement(
        "div",
        "sky-share-brand",
        ""
    );

    sectionElement = createElement(
        "div",
        "sky-share-section",
        ""
    );

    header.appendChild(brand);
    header.appendChild(sectionElement);


    /* -----------------------------------------------------
       Main
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       Media host
    ----------------------------------------------------- */

    mediaHost = createElement(
        "div",
        "sky-share-media-host"
    );

    mediaHost.id = "skyShareMediaHost";


    /* -----------------------------------------------------
       Share status
    ----------------------------------------------------- */

    statusElement = createElement(
        "div",
        "sky-share-status"
    );


    /* -----------------------------------------------------
       Existing small Open link
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       X button
    ----------------------------------------------------- */

    closeButton = createElement(
        "button",
        "sky-share-close-button",
        "×"
    );

    closeButton.type = "button";
    closeButton.setAttribute(
        "aria-label",
        "Close shared item"
    );
    closeButton.title = "Close";


    /*
     * The X is wired directly here so it does not depend on
     * the normal Reader close handler.
     */
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


    /*
     * The normal header is deliberately empty on Share Mode.
     * The item title is displayed by sky-share-heading.
     */
    brand.textContent = "";
}


/* =========================================================
   SHARE MODE APPLICATION ISOLATION
========================================================= */

function isolateApplication() {

    document.body.classList.add("sky-share-mode");

    /*
     * Normal application surfaces.
     */
    const selectors = [

        "#frontPage",
        "#frontSection",

        "#workspace",
        "#videoSection",
        "#slideshowSection",

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
        ".slideshow-library",

        "#topBar",
        "#topSearchGroup",
        "#topBarRightControls"
    ];

    selectors.forEach(selector => {

        document
            .querySelectorAll(selector)
            .forEach(element => {

                element.dataset.skyShareHidden = "true";

                element.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            });
    });


    /*
     * Normal app navigation.
     */
    document
        .querySelectorAll(
            "[data-app-target], .app-switch-button"
        )
        .forEach(element => {

            element.dataset.skyShareHidden = "true";

            element.style.setProperty(
                "display",
                "none",
                "important"
            );
        });
}


/* =========================================================
   BOOK ELEMENT MOUNTING
========================================================= */

function mountBookUI() {

    /*
     * These elements normally live as siblings inside the
     * Reader workspace.
     *
     * Moving them into mediaHost gives Share Mode one clean
     * coordinate system and also ensures fullscreen contains
     * the controls and status rows.
     */

    const ids = [
        "viewerArea",
        "toolbar",
        "statusBar"
    ];

    ids.forEach(id => {

        const element =
            document.getElementById(id);

        if (!element) {
            return;
        }

        if (
            !element.dataset.skyShareOriginalParent
        ) {

            element.dataset.skyShareOriginalParent =
                element.parentElement
                    ? element.parentElement.id || ""
                    : "";

            element.dataset.skyShareOriginalDisplay =
                element.style.display || "";
        }

        mediaHost.appendChild(element);

        mountedBookElements.push(element);
    });


    /*
     * There can be more than one welcome banner in the app.
     * Use the Reader banner associated with the current Reader
     * workspace. If that cannot be identified, use the first
     * available banner that has not already been mounted.
     */

    const welcome =
        document.querySelector(
            "#workspace .sr-welcome-banner"
        ) ||
        document.querySelector(
            ".sr-welcome-banner"
        );

    if (welcome) {

        if (
            !welcome.dataset.skyShareOriginalParent
        ) {

            welcome.dataset.skyShareOriginalParent =
                welcome.parentElement
                    ? welcome.parentElement.id || ""
                    : "";

            welcome.dataset.skyShareOriginalDisplay =
                welcome.style.display || "";
        }

        mediaHost.appendChild(welcome);

        mountedBookElements.push(welcome);
    }


    /*
     * The normal Reader toolbar is now physically inside the
     * Share media host.
     */
    document.body.classList.add("sky-share-book");
}


/* =========================================================
   READER CONTROL HELPERS
========================================================= */

function getReaderButton(id) {

    return document.getElementById(id);
}


function setReaderButtonVisible(id, visible) {

    const button = getReaderButton(id);

    if (!button) {
        return;
    }

    button.style.setProperty(
        "display",
        visible ? "flex" : "none",
        "important"
    );

    button.style.setProperty(
        "visibility",
        visible ? "visible" : "hidden",
        "important"
    );

    button.style.setProperty(
        "opacity",
        visible ? "1" : "0",
        "important"
    );

    button.style.setProperty(
        "pointer-events",
        visible ? "auto" : "none",
        "important"
    );
}


function updateNavigationVisibility() {

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

    const page =
        Number(Reader.currentPage()) || 1;

    const pages =
        Number(Reader.pages()) || 0;

    if (!pages) {
        return;
    }


    /*
     * Previous is hidden on page 1.
     */
    setReaderButtonVisible(
        "previousButton",
        page > 1
    );


    /*
     * Next is hidden on the final page.
     */
    setReaderButtonVisible(
        "nextButton",
        page < pages
    );


    /*
     * Rotate is permanently unavailable in Share Mode.
     */
    setReaderButtonVisible(
        "rotateButton",
        false
    );
}


/* =========================================================
   MUTE
========================================================= */

function updateMuteIcon() {

    const button =
        getReaderButton("muteButton");

    if (!button) {
        return;
    }

    const muted =
        !!(
            window.AudioController &&
            typeof AudioController.isMuted === "function" &&
            AudioController.isMuted()
        );


    /*
     * This duplicates the existing Reader visual update
     * intentionally, without changing AudioController.
     */
    button.innerHTML =
        `<svg class="icon"><use href="#${
            muted
                ? "icon-muted"
                : "icon-volume"
        }"></use></svg>`;

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


function bindMute() {

    const button =
        getReaderButton("muteButton");

    if (!button) {
        return;
    }

    if (button.dataset.skyShareBound === "true") {
        updateMuteIcon();
        return;
    }

    button.dataset.skyShareBound = "true";

    button.addEventListener(
        "click",
        event => {

            event.preventDefault();
            event.stopPropagation();

            if (
                window.AudioController &&
                typeof AudioController.toggleMute === "function"
            ) {
                AudioController.toggleMute();
            }

            updateMuteIcon();
        }
    );

    updateMuteIcon();
}


/* =========================================================
   SHARE BUTTON
========================================================= */

function bindShare() {

    const button =
        getReaderButton("readerShareButton");

    if (!button) {
        return;
    }

    if (button.dataset.skyShareBound === "true") {
        return;
    }

    button.dataset.skyShareBound = "true";

    button.addEventListener(
        "click",
        async event => {

            event.preventDefault();
            event.stopPropagation();

            const book =
                window.Reader &&
                typeof Reader.book === "function"
                    ? Reader.book()
                    : activeItem;

            if (
                !book ||
                !book.id
            ) {
                console.warn(
                    "[SkyMedia Share] No current book available for sharing."
                );
                return;
            }

            if (
                window.ShareManager &&
                typeof ShareManager.share === "function"
            ) {

                /*
                 * IMPORTANT:
                 * ShareManager is the existing short-link/KV
                 * implementation. Do not construct the URL here.
                 */
                await ShareManager.share(
                    "reader",
                    book
                );

                return;
            }

            console.warn(
                "[SkyMedia Share] ShareManager.share() unavailable."
            );
        }
    );
}


/* =========================================================
   FULLSCREEN
========================================================= */

async function enterShareFullscreen() {

    if (!shell) {
        return;
    }

    try {

        if (
            document.fullscreenElement === shell
        ) {
            return;
        }

        if (
            document.fullscreenElement &&
            document.exitFullscreen
        ) {
            await document.exitFullscreen();
        }

        if (
            typeof shell.requestFullscreen === "function"
        ) {
            await shell.requestFullscreen();
        }

    } catch (error) {

        console.warn(
            "[SkyMedia Share] Fullscreen failed.",
            error
        );
    }
}


async function exitShareFullscreen() {

    try {

        if (
            document.fullscreenElement &&
            document.exitFullscreen
        ) {
            await document.exitFullscreen();
        }

    } catch (error) {

        console.warn(
            "[SkyMedia Share] Fullscreen exit failed.",
            error
        );
    }
}


function bindFullscreen() {

    const button =
        getReaderButton("viewerFullscreenButton");

    if (!button) {
        return;
    }

    if (button.dataset.skyShareBound === "true") {
        return;
    }

    button.dataset.skyShareBound = "true";

    button.addEventListener(
        "click",
        event => {

            event.preventDefault();
            event.stopPropagation();

            if (
                document.fullscreenElement === shell
            ) {
                exitShareFullscreen();
            } else {
                enterShareFullscreen();
            }
        }
    );
}


/* =========================================================
   PREVIOUS / NEXT
========================================================= */

function bindNavigation() {

    const previous =
        getReaderButton("previousButton");

    const next =
        getReaderButton("nextButton");


    if (
        previous &&
        previous.dataset.skyShareBound !== "true"
    ) {

        previous.dataset.skyShareBound = "true";

        previous.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                if (
                    window.SRNavigation &&
                    typeof SRNavigation.previous === "function"
                ) {
                    SRNavigation.previous();
                }

                window.setTimeout(
                    updateNavigationVisibility,
                    50
                );

                window.setTimeout(
                    updateNavigationVisibility,
                    700
                );
            }
        );
    }


    if (
        next &&
        next.dataset.skyShareBound !== "true"
    ) {

        next.dataset.skyShareBound = "true";

        next.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                const page =
                    Number(
                        window.Reader?.currentPage?.()
                    ) || 1;

                const pages =
                    Number(
                        window.Reader?.pages?.()
                    ) || 0;


                /*
                 * Never ask SRNavigation to go forward from
                 * the last page.
                 */
                if (
                    pages &&
                    page >= pages
                ) {
                    updateNavigationVisibility();
                    return;
                }


                if (
                    window.SRNavigation &&
                    typeof SRNavigation.next === "function"
                ) {
                    SRNavigation.next();
                }

                window.setTimeout(
                    updateNavigationVisibility,
                    50
                );

                window.setTimeout(
                    updateNavigationVisibility,
                    700
                );
            }
        );
    }
}


/* =========================================================
   PAGE-FLIP PAGE EVENTS
========================================================= */

function bindEnginePageEvents() {

    if (
        window.Sky180FlipEngine &&
        typeof Sky180FlipEngine.on === "function"
    ) {

        Sky180FlipEngine.on(
            "page",
            function () {

                updateNavigationVisibility();
            }
        );
    }
}


/* =========================================================
   WHEEL NAVIGATION
========================================================= */

function bindWheelNavigation() {

    if (
        document.body.dataset.skyShareWheelBound === "true"
    ) {
        return;
    }

    document.body.dataset.skyShareWheelBound = "true";


    /*
     * Capture at document level.
     *
     * SRNavigation already has a wheel listener attached to
     * #viewerArea. Capturing here lets Share Mode control the
     * event before normal last-page behavior can interfere.
     */
    document.addEventListener(
        "wheel",
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

            const viewer =
                document.getElementById("viewerArea");

            if (
                !viewer ||
                !viewer.contains(event.target)
            ) {
                return;
            }


            /*
             * Preserve Ctrl-wheel zoom behavior.
             */
            if (event.ctrlKey) {
                return;
            }


            if (wheelLocked) {
                event.preventDefault();
                return;
            }


            const delta =
                Number(event.deltaY) || 0;

            if (Math.abs(delta) < 10) {
                return;
            }


            event.preventDefault();
            event.stopPropagation();


            wheelLocked = true;

            window.setTimeout(
                () => {
                    wheelLocked = false;
                },
                550
            );


            const page =
                Number(
                    window.Reader?.currentPage?.()
                ) || 1;

            const pages =
                Number(
                    window.Reader?.pages?.()
                ) || 0;


            if (delta > 0) {

                if (
                    pages &&
                    page >= pages
                ) {
                    updateNavigationVisibility();
                    return;
                }

                if (
                    window.SRNavigation &&
                    typeof SRNavigation.next === "function"
                ) {
                    SRNavigation.next();
                }

            } else {

                if (
                    page <= 1
                ) {
                    updateNavigationVisibility();
                    return;
                }

                if (
                    window.SRNavigation &&
                    typeof SRNavigation.previous === "function"
                ) {
                    SRNavigation.previous();
                }
            }


            window.setTimeout(
                updateNavigationVisibility,
                80
            );

            window.setTimeout(
                updateNavigationVisibility,
                700
            );

        },
        true
    );
}


/* =========================================================
   LAST-PAGE MOUSE CLICK PROTECTION
========================================================= */

function bindLastPageProtection() {

    if (
        document.body.dataset.skyShareLastPageGuard === "true"
    ) {
        return;
    }

    document.body.dataset.skyShareLastPageGuard = "true";


    /*
     * SRNavigation listens for skyreader:last-page-click and
     * normally calls navigation.closeMagazine().
     *
     * The Share Viewer must NOT do that.
     *
     * Capture at document level so the existing event never
     * reaches the normal close handler.
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

            /*
             * Do not use stopImmediatePropagation here because
             * other Share Mode listeners may legitimately need
             * to observe the event.
             *
             * The normal SRNavigation listener is protected by
             * Share Mode's capture interception below.
             */
            event.stopImmediatePropagation();

            updateNavigationVisibility();

        },
        true
    );
}


/* =========================================================
   CLOSE / SHARE LANDING
========================================================= */

function showClosedPanel() {

    if (!shell) {
        return;
    }


    /*
     * Remove the active document visually.
     */
    if (mediaHost) {
        mediaHost.classList.add(
            "sky-share-document-closed"
        );
    }


    /*
     * Hide title/status/header while the closed state is shown.
     */
    shell.classList.add(
        "sky-share-document-closed"
    );


    /*
     * Create the large navigation panel once.
     */
    if (!closedPanel) {

        closedPanel =
            createElement(
                "div",
                "sky-share-closed-panel"
            );

        const message =
            createElement(
                "div",
                "sky-share-closed-message",
                "This shared item has been closed."
            );


        const bigButton =
            createElement(
                "a",
                "sky-share-big-open-button",
                "Open Meditation Mornings"
            );

        bigButton.href =
            GLIDE_MEDIA_URL;

        bigButton.target =
            "_blank";

        bigButton.rel =
            "noopener noreferrer";


        closedPanel.appendChild(message);
        closedPanel.appendChild(bigButton);

        shell.querySelector(
            ".sky-share-main"
        ).appendChild(
            closedPanel
        );
    }


    closedPanel.hidden = false;
    closedPanel.style.display = "flex";
}


function hideClosedPanel() {

    if (!closedPanel) {
        return;
    }

    closedPanel.hidden = true;
    closedPanel.style.display = "none";
}


function close() {

    /*
     * X is intentionally a Share Viewer action.
     * It does not navigate away.
     */

    exitShareFullscreen();


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

            /*
             * Reader.close() performs the legitimate Reader
             * engine cleanup. It also normally calls
             * UI.showLibrary(true).
             *
             * We immediately restore Share Mode's isolation
             * afterward, so that normal Reader landing cannot
             * appear.
             */
            Reader.close({
                playSound: false
            });
        }

    } catch (error) {

        console.warn(
            "[SkyMedia Share] Close cleanup failed.",
            error
        );
    }


    /*
     * Reader.close() may have exposed the normal Reader UI.
     * Re-isolate it immediately.
     */
    isolateApplication();


    /*
     * Keep Share shell visible and show our own closed state.
     */
    showClosedPanel();
}


/* =========================================================
   FULLSCREEN CHANGE
========================================================= */

function bindFullscreenChange() {

    if (
        document.body.dataset.skyShareFullscreenBound === "true"
    ) {
        return;
    }

    document.body.dataset.skyShareFullscreenBound = "true";


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

            if (
                document.fullscreenElement === shell
            ) {
                shell?.classList.add(
                    "sky-share-fullscreen"
                );
            } else {
                shell?.classList.remove(
                    "sky-share-fullscreen"
                );
            }
        }
    );
}


/* =========================================================
   ESCAPE
========================================================= */

function bindEscape() {

    if (
        document.body.dataset.skyShareEscapeBound === "true"
    ) {
        return;
    }

    document.body.dataset.skyShareEscapeBound = "true";


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


            /*
             * If fullscreen, Escape first exits fullscreen.
             * A second Escape closes the document.
             */
            if (
                document.fullscreenElement === shell
            ) {

                exitShareFullscreen();
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


/* =========================================================
   BOOK PREPARATION
========================================================= */

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
        document.getElementById("viewerArea");

    if (!viewerArea) {
        throw new Error(
            "Share Mode: #viewerArea not found."
        );
    }


    /*
     * Open through the normal Reader first.
     *
     * This is important because Reader/Renderer own all
     * PDF and PageFlip initialization.
     */
    await Reader.open(item);


    /*
     * Now move the live Reader controls and viewer into
     * Share Mode.
     */
    mountBookUI();


    /*
     * Explicitly establish Share Mode control handlers.
     */
    bindNavigation();
    bindMute();
    bindShare();
    bindFullscreen();

    bindEnginePageEvents();
    bindWheelNavigation();
    bindLastPageProtection();


    /*
     * Ensure normal Reader controls that Share Mode does
     * not use remain unavailable.
     */
    setReaderButtonVisible(
        "rotateButton",
        false
    );

    setReaderButtonVisible(
        "bookmarkAddButton",
        false
    );


    /*
     * Make sure the controls we do use are available.
     */
    setReaderButtonVisible(
        "muteButton",
        true
    );

    setReaderButtonVisible(
        "readerShareButton",
        true
    );

    setReaderButtonVisible(
        "viewerFullscreenButton",
        true
    );

    setReaderButtonVisible(
        "readerCloseButton",
        true
    );


    updateMuteIcon();
    updateNavigationVisibility();


    /*
     * Give the PageFlip engine one resize after its new
     * Share Mode container has been established.
     */
    if (
        window.Reader &&
        typeof Reader.refresh === "function"
    ) {
        requestAnimationFrame(
            () => Reader.refresh()
        );
    }
}


/* =========================================================
   VIDEO
========================================================= */

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
        document.getElementById("videoViewer");

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


    mediaHost.appendChild(viewer);

    viewer.style.display = "";


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


/* =========================================================
   SLIDESHOW
========================================================= */

async function prepareSlideshow(item) {

    if (
        typeof SlideshowLibrary === "undefined"
    ) {
        throw new Error(
            "Share Mode: SlideshowLibrary unavailable."
        );
    }

    if (
        typeof SlideshowViewer === "undefined"
    ) {
        throw new Error(
            "Share Mode: SlideshowViewer unavailable."
        );
    }


    if (
        typeof SlideshowLibrary.init === "function"
    ) {
        SlideshowLibrary.init();
    }


    if (
        typeof Manifest !== "undefined" &&
        Manifest.slideshows &&
        typeof Manifest.slideshows.load === "function"
    ) {
        await Manifest.slideshows.load();
    }


    if (
        typeof SlideshowViewer.init === "function"
    ) {
        SlideshowViewer.init();
    }


    if (
        typeof SlideshowUI !== "undefined" &&
        typeof SlideshowUI.init === "function"
    ) {
        SlideshowUI.init();
    }


    const viewer =
        document.getElementById("slideshowViewer");

    if (!viewer) {
        throw new Error(
            "Share Mode: #slideshowViewer not found."
        );
    }


    mediaHost.appendChild(viewer);

    viewer.style.display = "";


    await SlideshowViewer.open(item);
}


/* =========================================================
   OPEN ITEM
========================================================= */

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
            item.title || "Meditation Mornings"
        ).trim();


    subtitleElement.textContent =
        String(
            item.subtitle || ""
        ).trim();


    sectionElement.textContent =
        getSectionLabel(section);


    statusElement.textContent =
        "Opening " +
        getSectionLabel(section).toLowerCase() +
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


/* =========================================================
   START
========================================================= */

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


    try {

        createShell();

        bindEscape();
        bindFullscreenChange();


        await openItem(
            item,
            target
        );


        /*
         * Only isolate after the requested item has
         * successfully opened.
         */
        isolateApplication();


        /*
         * Ensure the Share shell is above all normal app
         * surfaces.
         */
        shell.style.zIndex = "999999";


        /*
         * Closed-state panel is not shown initially.
         */
        hideClosedPanel();

    } catch (error) {

        started = false;

        console.error(
            "[SkyMedia Share] STARTUP FAILED:",
            error
        );

        throw error;
    }
}


/* =========================================================
   PUBLIC API
========================================================= */

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
