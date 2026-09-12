"use strict";

/*
=========================================================
 SkyMedia Unified Manifest

 Loads ONE content source and publishes normalized collections
 to Reader, Video Viewer, and Slideshow Viewer.

 Source priority:
   1. Glide contract
   2. content.json

 The raw source is never exposed directly to feature modules.
=========================================================
*/

const SKYMEDIA_MANIFEST_CACHE_KEY = "skymedia-manifest-cache-v2";

window.Manifest = {

    source: {
        url: "content.json?v=3.0.1",

        async load() {
            const separator = this.url.includes("?") ? "&" : "?";
            const freshUrl = `${this.url}${separator}_=${Date.now()}`;
            const response = await fetch(freshUrl, { cache: "no-store" });

            if (!response.ok) {
                throw new Error("Unable to load content.json");
            }

            return response.json();
        }
    },

    _data: null,
    _refreshPromise: null,

    async load() {
        /*
         * Startup uses the last successful normalized manifest as a fast
         * bootstrap snapshot, then ALWAYS revalidates the live source in the
         * background. This prevents a slow network request from blocking the
         * initial Front Page while preserving the requirement that new data
         * is processed whenever the app is loaded.
         */
        const install = (manifest, rawManifest = null) => {
            if (!manifest || !Array.isArray(manifest.content) || !manifest.content.length) {
                return false;
            }

            this._data = manifest;

            const books = this.content("book");
            const videos = this.content("video");
            const slideshows = this.content("slideshow");

            SkyReader.library = [...books];
            SkyReader.filteredLibrary = [...books];

            const background = rawManifest && typeof rawManifest === "object"
                ? rawManifest.background
                : (manifest.background || null);

            if (background) {
                SkyReader.settings.background = background;
                const viewerBackground = document.getElementById("viewerBackground");
                if (viewerBackground) {
                    viewerBackground.style.backgroundImage = `url('${background}')`;
                }
            }

            window.dispatchEvent(new CustomEvent("skymedia:manifest-ready", {
                detail: { manifest }
            }));

            return true;
        };

        const readCache = () => {
            try {
                const cached = JSON.parse(localStorage.getItem(SKYMEDIA_MANIFEST_CACHE_KEY) || "null");
                return cached && Array.isArray(cached.content) ? cached : null;
            } catch (error) {
                return null;
            }
        };

        const writeCache = manifest => {
            try {
                localStorage.setItem(SKYMEDIA_MANIFEST_CACHE_KEY, JSON.stringify(manifest));
            } catch (error) {
                /* Storage/quota/privacy restrictions are not fatal. */
            }
        };

        const fetchFresh = async () => {
            const rawManifest =
                GlideContract.available()
                    ? await GlideContract.load()
                    : await this.source.load();

            const manifest = ContentContract.normalizeManifest(rawManifest);

            if (!manifest.content.length) {
                throw new Error("No visible content is available.");
            }

            install(manifest, rawManifest);
            writeCache(manifest);

            if (manifest.diagnostics.length) {
                console.info(
                    "[Manifest] Normalization diagnostics:",
                    ...manifest.diagnostics
                );
            }

            SkyReader.setLoading(
                20,
                `Content loaded: ${this.books().length} books, ${this.videos().length} videos, ${this.slideshows().length} slideshows`
            );

            return manifest;
        };

        const cachedManifest = readCache();

        if (cachedManifest && install(cachedManifest)) {
            SkyReader.setLoading(20, "Refreshing content…");

            /* Fresh content is mandatory, but it is not on the critical
               rendering path. Reuse the normal coalesced refresh path so a
               simultaneous Front Page navigation cannot start a second fetch. */
            this.refresh({ destination: "front" }).catch(error => {
                console.warn(
                    "[Manifest] Background refresh failed; keeping cached content.",
                    error
                );
            });

            return this._data;
        }

        SkyReader.setLoading(5, "Loading content...");

        try {
            return await fetchFresh();
        } catch (error) {
            this._data = null;
            SkyReader.library = [];
            SkyReader.filteredLibrary = [];

            console.error("[Manifest] Content load failed", error);

            SkyReader.setStatus(
                error.message || "Unable to load SkyMedia content."
            );

            if (window.UI && typeof UI.showError === "function") {
                UI.showError(error, "Unable to load SkyMedia content.");
            }

            throw error;
        }
    },

    /*
    -------------------------------------------------------
     Front Page refresh

     Re-fetches content.json (bypassing any browser cache, same as
     the initial load) and replaces the published manifest in place.
     This exists so the Front Page can pick up brand-new inventory
     without a full page reload, and without disturbing anything
     that lives outside Manifest._data - theme, volume, favorites,
     and bookmarks are all stored separately and are never touched
     here.

     Unlike load(), a failed refresh does NOT clear existing content:
     a transient network hiccup should not blank out an already
     working Front Page. Concurrent calls are coalesced into the
     single in-flight fetch.
    -------------------------------------------------------
    */

    async refresh(options = {}) {
        if (this._refreshPromise) {
            return this._refreshPromise;
        }

        const destination = String(options.destination || "").trim().toLowerCase();

        this._refreshPromise = (async () => {
            try {
                const rawManifest =
                    GlideContract.available()
                        ? await GlideContract.load()
                        : await this.source.load();

                const manifest =
                    ContentContract.normalizeManifest(rawManifest);

                if (!manifest.content.length) {
                    throw new Error("No visible content is available.");
                }

                this._data = manifest;

                try {
                    localStorage.setItem(
                        SKYMEDIA_MANIFEST_CACHE_KEY,
                        JSON.stringify(manifest)
                    );
                } catch (error) {
                    /* Cache failure is never allowed to affect live content. */
                }

                const books = this.content("book");
                SkyReader.library = [...books];
                SkyReader.filteredLibrary = [...books];

                const background = rawManifest && typeof rawManifest === "object"
                    ? rawManifest.background
                    : null;

                if (background) {
                    SkyReader.settings.background = background;

                    const viewerBackground =
                        document.getElementById("viewerBackground");

                    if (viewerBackground) {
                        viewerBackground.style.backgroundImage =
                            `url('${background}')`;
                    }
                }

                /* Keep the currently visible destination's library synchronized
                   with the newly normalized manifest. Front Page consumes Manifest
                   directly; Video/Slideshow need their own rendered collections. */
                if (destination === "slideshow" && window.SlideshowLibrary) {
                    SlideshowLibrary.load(this.slideshows());
                } else if (destination === "video" && window.VideoLibrary) {
                    VideoLibrary.load(this.videos());
                }

                window.dispatchEvent(new CustomEvent("skymedia:manifest-ready", {
                    detail: { manifest, destination }
                }));

                return manifest;

            } catch (error) {
                console.warn(
                    "[Manifest] Refresh failed; keeping existing content.",
                    error
                );
                return null;

            } finally {
                this._refreshPromise = null;
            }
        })();

        return this._refreshPromise;
    },

    all() {
        const items = this._data
            ? [...this._data.content]
            : [];

        /*
         * Publishing gate: an item is only ever exposed to any
         * consumer (Reader/Booklets library, Video library, Slideshow
         * library, or the Front Page) once it has a valid release
         * date-time that is on or before right now. This is the one
         * choke point every section's data flows through, so
         * filtering here is enough to keep unpublished inventory out
         * of every library grid and out of the front-door shapes —
         * no per-section filtering needed.
         */
        /*
         * Fail closed if the date-visibility utility is unavailable.
         * Publishing is a safety boundary: absence of the gate must
         * never mean "everything is visible."
         */
        if (
            !window.SkyDate ||
            typeof SkyDate.isVisible !== "function"
        ) {
            console.warn(
                "[Manifest] SkyDate visibility gate unavailable; returning no content."
            );
            return [];
        }

        return items.filter(item =>
            SkyDate.isVisible(item.date)
        );
    },

    content(type) {
        return this.all().filter(item => item.type === type);
    },

    books() {
        return this.content("book");
    },

    videos() {
        return this.content("video");
    },

    slideshows() {
        return this.content("slideshow");
    },

    diagnostics() {
        return this._data
            ? [...this._data.diagnostics]
            : [];
    },

    frontPageCategories() {
        return this._data && this._data.frontPage && Array.isArray(this._data.frontPage.categories)
            ? [...this._data.frontPage.categories]
            : [];
    },

    normalize(rawManifest) {
        return ContentContract.normalizeManifest(rawManifest);
    },

    validate(rawManifest) {
        return this.normalize(rawManifest);
    },

    /*
    -------------------------------------------------------
     Runtime count reconciliation
    -------------------------------------------------------

     PDF page counts are authoritative only after PDF.js opens
     the document. This method is deliberately public so the
     Reader and Slideshow Viewer can correct their in-memory
     metadata without changing the supplied source.
    -------------------------------------------------------
    */

    reconcileBookCount(book, actualCount) {
        ContentContract.reconcileBookCount(book, actualCount);
        return book;
    },

    reconcileSlideshowCount(slideshow, actualCount) {
        ContentContract.reconcileSlideshowCount(slideshow, actualCount);
        return slideshow;
    }
};
