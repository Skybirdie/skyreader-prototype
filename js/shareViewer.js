"use strict";

/*

SkyMedia Share Viewer
Version 1.1.0

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

BOOK SHARE CONTROL FIX

Share Mode mounts #viewerArea into the Share shell, but the
normal Reader toolbar remains in #workspace.

This version explicitly prepares the existing Reader controls
for Share Mode instead of creating duplicate Reader controls.

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

/*
 * Reader controls temporarily exposed while a book is in
 * Share Mode.
 */
let bookControls = [];
let bookControlState = [];


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
  Reader control helpers
-------------------------------------------------------*/

function findFirst(selectors) {

    for (const selector of selectors) {

        const element =
            document.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}


/*
 * Locate the actual Reader controls already used by the
 * normal SkyMedia Reader.
 *
 * We deliberately use the existing elements rather than
 * creating duplicate buttons.
 */
function collectBookControls() {

    const candidates = [

        findFirst([
            "#toolbar"
        ]),

        findFirst([
            "#previousButton",
            "#prevButton",
            "[data-reader-action='previous']",
            "[data-action='previous']"
        ]),

        findFirst([
            "#nextButton",
            "[data-reader-action='next']",
            "[data-action='next']"
        ]),

        findFirst([
            "#fullscreenButton",
            "#readerFullscreenButton",
            "[data-reader-action='fullscreen']",
            "[data-action='fullscreen']"
        ]),

        findFirst([
            "#muteButton",
            "#readerMuteButton",
            "[data-reader-action='mute']",
            "[data-action='mute']"
        ]),

        findFirst([
            "#shareButton",
            "#readerShareButton",
            "[data-reader-action='share']",
            "[data-action='share']"
        ]),

        findFirst([
            "#statusBar"
        ]),

        ...Array.from(
            document.querySelectorAll(
                ".sr-welcome-banner"
            )
        )
    ];


    const unique = [];

    candidates.forEach(element => {

        if (
            element &&
            !unique.includes(element)
        ) {
            unique.push(element);
        }

    });

    return unique;
}


/*
 * Prepare the existing Reader controls for Share Mode.
 *
 * Important:
 * We do NOT attach replacement Reader logic here.
 *
 * Existing click handlers installed by Reader/UI remain
 * attached to the original DOM elements.
 */
function exposeBookControls() {

    bookControls = collectBookControls();

    bookControlState = bookControls.map(element => ({
        element,
        display: element.style.display,
        visibility: element.style.visibility,
        pointerEvents: element.style.pointerEvents,
        position: element.style.position,
        zIndex: element.style.zIndex,
        opacity: element.style.opacity
    }));


    bookControls.forEach(element => {

        element.dataset.skyShareReaderControl = "true";

        /*
         * The Share shell can sit over the normal application
         * workspace. Give the existing Reader controls a
         * guaranteed interaction layer.
         */
        element.style.pointerEvents = "auto";

        /*
         * Do not force everything to fixed positioning here.
         * share.css already controls the Reader toolbar layout.
         *
         * We only establish a stacking layer if necessary.
         */
        if (
            element.id === "toolbar" ||
            element.id === "statusBar" ||
            element.classList.contains("sr-welcome-banner")
        ) {
            element.style.zIndex = "1000002";
        }

    });


    /*
     * The Share shell itself must not become a transparent
     * click shield over the Reader controls.
     *
     * Its normal content remains interactive; only the areas
     * occupied by Reader controls are allowed to receive the
     * Reader events through their higher z-index.
     */
    document.body.classList.add(
        "sky-share-book-controls-active"
    );


    /*
     * Diagnostic information. This is intentionally useful
     * when testing a share link in browser DevTools.
     */
    console.log(
        "[SkyMedia Share] Reader controls exposed:",
        bookControls.map(element => ({
            id: element.id,
            className: element.className,
            tag: element.tagName
        }))
    );
}


/*
 * Restore only the inline styles changed by Share Mode.
 *
 * Normally Share Mode closes by navigating back to Glide,
 * but this keeps the module clean if close/cleanup is called
 * before navigation.
 */
function restoreBookControls() {

    bookControlState.forEach(state => {

        const element = state.element;

        if (!element) {
            return;
        }

        element.style.display = state.display;
        element.style.visibility = state.visibility;
        element.style.pointerEvents = state.pointerEvents;
        element.style.position = state.position;
        element.style.zIndex = state.zIndex;
        element.style.opacity = state.opacity;

        delete element.dataset.skyShareReaderControl;
    });


    bookControls = [];
    bookControlState = [];

    document.body.classList.remove(
        "sky-share-book-controls-active"
    );
}


/*
 * Verify that the controls are actually connected to the
 * Reader DOM after Reader.open() has completed.
 *
 * This does NOT replace their event handlers.
 *
 * It simply reports the exact elements and whether they are
 * currently disabled/hidden.
 */
function verifyBookControls() {

    const ids = [
        "toolbar",
        "previousButton",
        "nextButton",
        "fullscreenButton",
        "muteButton",
        "shareButton",
        "statusBar"
    ];


    const result = {};

    ids.forEach(id => {

        const element =
            document.getElementById(id);

        result[id] = element
            ? {
                exists: true,
                display: getComputedStyle(element).display,
                visibility: getComputedStyle(element).visibility,
                pointerEvents: getComputedStyle(element).pointerEvents,
                disabled: !!element.disabled
            }
            : {
                exists: false
            };

    });


    console.log(
        "[SkyMedia Share] Reader control state:",
        result
    );
}


/*-------------------------------------------------------
  Normal application shell isolation
-------------------------------------------------------*/

function isolateApplication(section) {

    document.body.classList.add("sky-share-mode");


    /*
     * Hide normal application sections/chrome.
     */

    const isBookShare =
        section === "reader" ||
        section === "book";


    const selectors = [

        "#frontPage",
        "#frontSection",

        /*
         * IMPORTANT:
         *
         * Do not hide #workspace for a book share.
         *
         * The Reader toolbar/status/welcome elements live
         * there even though #viewerArea is moved into the
         * Share host.
         */
        ...(isBookShare ? [] : ["#workspace"]),

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
     * Hide the normal Front Page.
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
     * IMPORTANT:
     *
     * Do not hide .sr-welcome-banner here for book shares.
     *
     * It may be part of the Reader presentation that the
     * current Share CSS intentionally exposes.
     */
    if (!isBookShare) {

        document
            .querySelectorAll(".sr-welcome-banner")
            .forEach(element => {

                element.dataset.skyShareHidden = "true";
                element.style.display = "none";

            });

    }


    /*
     * Reassert Reader control exposure after all application
     * isolation has happened.
     *
     * This is important because some normal application CSS
     * uses workspace-level visibility rules.
     */
    if (isBookShare) {
        exposeBookControls();
    }
}


/*-------------------------------------------------------
  Viewer mounting helpers
-------------------------------------------------------*/

function detachExistingViewer(viewer) {

    if (!viewer) {
        return;
    }


    /*
     * The actual rendering element remains in the document
     * because the existing engine depends on it.
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
  Video
-------------------------------------------------------*/

function prepareVideo(item) {

    /*
     * VideoLibrary is needed internally because
     * VideoViewer.init() expects its library dependency.
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


    if (
        window.VideoViewer &&
        typeof VideoViewer.init === "function"
    ) {

        VideoViewer.init();

    }


    detachExistingViewer(viewer);


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


/*-------------------------------------------------------
  Slideshow
-------------------------------------------------------*/

async function prepareSlideshow(item) {

    if (
        typeof SlideshowLibrary === "undefined"
    ) {

        throw new Error(
            "Share Mode: SlideshowLibrary is not available."
        );

    }


    if (
        typeof SlideshowViewer === "undefined"
    ) {

        throw new Error(
            "Share Mode: SlideshowViewer is not available."
        );

    }


    /*
     * Initialize slideshow library first.
     */

    if (
        typeof SlideshowLibrary.init === "function"
    ) {

        SlideshowLibrary.init();

    }


    /*
     * Load slideshow manifest.
     */

    if (
        typeof Manifest !== "undefined" &&
        typeof Manifest.slideshows !== "undefined" &&
        typeof Manifest.slideshows.load === "function"
    ) {

        await Manifest.slideshows.load();

    }


    /*
     * Initialize actual slideshow viewer.
     */

    const initialized =
        SlideshowViewer.init();


    if (initialized === false) {

        throw new Error(
            "Share Mode: SlideshowViewer failed to initialize."
        );

    }


    /*
     * Share Mode bypasses normal application startup,
     * so explicitly initialize SlideshowUI when available.
     */

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
            "Share Mode: #slideshowViewer was not found."
        );

    }


    detachExistingViewer(viewer);


    /*
     * Do not initialize the viewer again after moving it.
     */

    await SlideshowViewer.open(item);

    return viewer;
}


/*-------------------------------------------------------
  Book
-------------------------------------------------------*/

async function prepareBook(item) {

    /*
     * Reader/Renderer initialize automatically from
     * DOMContentLoaded. Reuse the existing Reader engine.
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
     * Make sure the existing Reader toolbar exists before
     * opening the book.
     *
     * We do NOT hide #workspace because the Reader controls
     * live there.
     */
    exposeBookControls();


    /*
     * Move only the actual Reader viewing surface.
     */
    detachExistingViewer(viewerArea);


    viewerArea.style.display = "";


    /*
     * Open the exact shared book.
     */
    await Reader.open(item);


    /*
     * Reader.open() can update DOM state. Reassert the
     * Share Mode control layer after the book has opened.
     */
    exposeBookControls();


    verifyBookControls();
}


/*-------------------------------------------------------
  Media type dispatch
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
     * Restore temporary Share Mode control state before
     * leaving the page.
     */
    restoreBookControls();


    /*
     * Return to the normal SkyMedia URL.
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


    console.log(
        "[SkyMedia Share] start() entered."
    );


    if (!item) {

        console.error(
            "[SkyMedia Share] No item supplied."
        );

        throw new Error(
            "Share Mode: no item supplied."
        );

    }


    if (!target) {

        console.error(
            "[SkyMedia Share] No target supplied."
        );

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

        console.log(
            "[SkyMedia Share] Creating shell."
        );

        createShell();


        console.log(
            "[SkyMedia Share] Binding Escape."
        );

        bindEscape();


        console.log(
            "[SkyMedia Share] Opening item."
        );

        await openItem(item, target);


        console.log(
            "[SkyMedia Share] Item opened successfully."
        );


        /*
         * Only isolate the normal application after the
         * requested viewer successfully opened.
         */
        isolateApplication(
            String(
                target.section ||
                item.type ||
                ""
            ).toLowerCase()
        );


        /*
         * One final verification after isolation.
         */
        if (
            String(
                target.section ||
                item.type ||
                ""
            ).toLowerCase() === "reader" ||
            String(
                target.section ||
                item.type ||
                ""
            ).toLowerCase() === "book"
        ) {

            exposeBookControls();
            verifyBookControls();

        }


        console.log(
            "[SkyMedia Share] Application isolated."
        );


    } catch (error) {

        console.error(
            "[SkyMedia Share] STARTUP FAILED:",
            error
        );


        restoreBookControls();

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