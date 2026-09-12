"use strict";

/*
=========================================================
 SkyReader App Switcher

 Owns which top-level media section is visible:
 - "reader"    -> #app        (SkyReader)
 - "video"     -> #videoSection (Video Viewer)

 A future "slideshow" section can be added the same way:
 give its root element an id, add it to SECTIONS below,
 and add a matching [data-app-target="slideshow"] button
 to the top bars. No other code needs to change.
=========================================================
*/

window.AppSwitcher = (function () {

    const STORAGE_KEY = "skymedia_active_app_v3";

    const SECTIONS = {
        front:  { rootId: "frontPage" },
        reader: { rootId: "app" },
        video:  { rootId: "videoSection" },
        slideshow: { rootId: "slideshowSection" }
    };

    let current = "reader";
    let initialized = false;


    function rootFor(id) {

        const section = SECTIONS[id];

        if (!section) {
            return null;
        }

        return document.getElementById(section.rootId);
    }


    function buttons() {

        return document.querySelectorAll(
            "[data-app-target]"
        );
    }


    function applyButtons() {

        buttons().forEach(button => {

            const active =
                button.getAttribute("data-app-target") === current;

            button.classList.toggle("active", active);

            button.setAttribute(
                "aria-pressed",
                active ? "true" : "false"
            );

        });

    }



    function save(id) {

        try {
            sessionStorage.setItem(STORAGE_KEY, id);
        }
        catch (error) {
            /* Storage unavailable — not fatal. */
        }

    }


function show(id, options = {}) {

    if (!SECTIONS[id]) {
        return;
    }

    /*
    -------------------------------------------------------
     Tell the global media manager that navigation is
     occurring.

     Background playback preference determines whether
     media managed by MediaManager should continue.
    -------------------------------------------------------
    */

    if (
        window.MediaManager &&
        typeof MediaManager.sectionChanged === "function"
    ) {
        MediaManager.sectionChanged(id);
    }

    /*
    -------------------------------------------------------
     Front Page media uses its own renderer, so explicitly
     apply the same background-playback preference here.

     Leaving Front Page:
       OFF -> stop Front Page media
       ON  -> allow it to continue

     Selecting another item is handled separately by
     FrontPage.openItem(), which always stops the previous
     Front Page item.
    -------------------------------------------------------
    */

    if (
        current === "front" &&
        id !== "front" &&
        window.FrontMediaRenderer &&
        typeof FrontMediaRenderer.stopPlayback === "function"
    ) {

        const continueInBackground =
            window.MediaManager &&
            typeof MediaManager.getBackgroundPlayback === "function"
                ? MediaManager.getBackgroundPlayback()
                : false;

        if (!continueInBackground) {
            FrontMediaRenderer.stopPlayback();
        }
    }

    current = id;


        Object.keys(SECTIONS).forEach(sectionId => {

            const root = rootFor(sectionId);

            if (!root) {
                return;
            }

            const active =
                sectionId === id;

            root.classList.toggle("app-section-active", active);
            root.classList.toggle("app-section-hidden", !active);

        });

        document.documentElement.dataset.activeApp = id;

        applyButtons();

        if (!options.skipSave) {
            save(id);
        }

        window.dispatchEvent(
            new CustomEvent("app:switched", { detail: { id } })
        );

        /*
        Whichever section just became visible may have been
        laid out while display:none (width/height of 0).
        Modules like VideoLibrary and VideoViewer already
        recompute their layout on "resize", so reuse that
        instead of adding a second refresh code path.
        */

        requestAnimationFrame(() => {
            if (id === "front" && window.FrontPage && typeof FrontPage.refresh === "function") {

                /* Render immediately from whatever is already cached so
                   navigating to the Front Page never shows a blank/stale
                   flash while the network round-trip below is in flight. */
                FrontPage.refresh();

                /*
                -------------------------------------------------------
                 Re-fetch content.json every time the Front Page becomes
                 active, so any newly-added inventory (and each door's
                 "newest per category" pick) is reflected immediately
                 instead of waiting on the browser's cache to expire.

                 Re-render only if the user is still on the Front Page
                 once the fetch resolves - they may have already
                 navigated elsewhere by then.
                -------------------------------------------------------
                */
                if (window.Manifest && typeof Manifest.refresh === "function") {
                    Manifest.refresh().then(() => {
                        if (current === "front") {
                            FrontPage.refresh();
                        }
                    });
                }
            }

            /*
            -------------------------------------------------------
             The Slideshow library grid is built (and the "alphabetical"
             sort applied) as soon as content loads at boot, well before
             the user has ever navigated to this section - so it's laid
             out while its images have no real width/height yet (still
             mid-decode) and the section itself may still be hidden.

             CSS multi-column layout (used here for the masonry packing)
             balances column heights from whatever box sizes exist at
             that moment; when a card's image hadn't finished decoding
             yet, that card got balanced in at a collapsed, text-only
             height and never grew back to size afterwards even once the
             image loaded - it just sat there looking blank/missing.

             Re-rendering the grid here, now that the section is
             genuinely visible and every image has almost certainly
             already loaded, forces the browser to redo that column
             balance against real box sizes. This only rebuilds the
             existing (already-sorted/filtered) list - it doesn't
             refetch or reorder anything.
            -------------------------------------------------------
            */
            if (id === "slideshow" && window.SlideshowLibrary && typeof SlideshowLibrary.render === "function") {
                SlideshowLibrary.render();
            }

            window.dispatchEvent(new Event("resize"));
        });

    }


    function init() {
    if (initialized) {
        return true;
    }

    if (
        !rootFor("front") &&
        !rootFor("reader") &&
        !rootFor("video") &&
        !rootFor("slideshow")
    ) {
        return false;
    }

    initialized = true;

    buttons().forEach(button => {
        button.addEventListener("click", () => {
            show(button.getAttribute("data-app-target"));
        });
    });

    /*
     * A browser reload should preserve the section currently being viewed.
     *
     * A fresh navigation into the site should begin at Front Page.
     *
     * Direct links can still explicitly select their requested section
     * through AppSwitcher.show().
     */
    let initialSection = "front";

    try {
        const navigationEntry = performance.getEntriesByType("navigation")[0];

        if (
            navigationEntry &&
            navigationEntry.type === "reload"
        ) {
            const saved = sessionStorage.getItem(STORAGE_KEY);

            if (saved && rootFor(saved)) {
                initialSection = saved;
            }
        }
    }
    catch (error) {
        initialSection = "front";
    }

    show(initialSection, { skipSave: false });

    return true;
}


    return {

        init,
        show,
        current: () => current

    };

})();
