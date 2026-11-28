"use strict";

/*
=========================================================
 SkyMedia Library Sync

 Why this exists
 ---------------
 Items publish themselves: Manifest.all() compares each item's
 release date-time with the clock EVERY time it is called, so the
 Front Page (which asks the Manifest) picks up a newly released
 item as soon as the clock passes its release time - even in a
 browser tab that has been open for hours.

 The section libraries are different. VideoLibrary, SlideshowLibrary
 and the Reader's library each take one snapshot of the released
 items when the page starts, and never look again. In a long-open
 tab the Front Page can therefore show an item (for example as the
 centerpiece) that the section library has never heard of.
 VideoLibrary.select(id) and friends silently do nothing for an
 unknown id, so "Open full viewer" ended with the app fullscreen,
 black, and no video.

 What it does
 ------------
 LibrarySync.ensure(section, id)
     Before the Front Page hands an item to a section: if that
     section's library does not hold the item but the Manifest says
     it is released, reload the library from the Manifest (exactly
     as at startup). If the library already holds it, nothing is
     touched - no reload, no re-shuffle - so the normal case costs
     one array lookup.
     Returns true when the library holds the item afterwards.

 LibrarySync.isOpen(section, id)
     true / false when the section's viewer can say whether that
     item is really open; null when it cannot (callers then behave
     as before). Used so the Front Page only goes fullscreen when
     the item actually opened.

 section is "video", "slideshow" or "reader".
=========================================================
*/
window.LibrarySync = (function () {

    function sameId(a, b) {
        return String(a ?? "") === String(b ?? "");
    }

    function holds(list, id) {
        return Array.isArray(list) &&
            list.some(entry => entry && sameId(entry.id, id));
    }

    const SECTIONS = {

        video: {
            held() {
                return window.VideoLibrary &&
                    typeof VideoLibrary.getVideos === "function"
                    ? VideoLibrary.getVideos()
                    : null;
            },
            released() {
                return window.Manifest &&
                    typeof Manifest.videos === "function"
                    ? Manifest.videos()
                    : null;
            },
            reload(list) {
                /* Same call the page makes at startup. */
                VideoLibrary.load(list);
            },
            open() {
                return window.VideoViewer &&
                    typeof VideoViewer.getCurrentVideo === "function"
                    ? VideoViewer.getCurrentVideo()
                    : undefined;
            }
        },

        slideshow: {
            held() {
                return window.SlideshowLibrary &&
                    typeof SlideshowLibrary.getSlideshows === "function"
                    ? SlideshowLibrary.getSlideshows()
                    : null;
            },
            released() {
                return window.Manifest &&
                    typeof Manifest.slideshows === "function"
                    ? Manifest.slideshows()
                    : null;
            },
            reload(list) {
                SlideshowLibrary.load(list);
            },
            open() {
                return window.SlideshowViewer &&
                    typeof SlideshowViewer.getCurrent === "function"
                    ? SlideshowViewer.getCurrent()
                    : undefined;
            }
        },

        reader: {
            held() {
                return window.SkyReader &&
                    Array.isArray(SkyReader.library)
                    ? SkyReader.library
                    : null;
            },
            released() {
                return window.Manifest &&
                    typeof Manifest.books === "function"
                    ? Manifest.books()
                    : null;
            },
            reload(list) {
                /* Same hand-off App.buildLibrary() makes after the
                   Manifest loads (Library.initialize() is not repeated:
                   it only binds events). */
                SkyReader.library = [...list];
                SkyReader.filteredLibrary = [...list];

                if (window.Library) {
                    if (typeof Library.applyOrganization === "function") {
                        Library.applyOrganization();
                    }
                    if (typeof Library.build === "function") {
                        Library.build();
                    }
                }
            },
            open() {
                return window.Reader &&
                    typeof Reader.book === "function"
                    ? Reader.book()
                    : undefined;
            }
        }
    };

    function ensure(section, id) {
        const spec = SECTIONS[section];

        if (!spec || id === undefined || id === null || id === "") {
            return false;
        }

        try {
            const held = spec.held();

            if (!Array.isArray(held)) {
                return false;
            }

            if (holds(held, id)) {
                return true;
            }

            const released = spec.released();

            if (!holds(released, id)) {
                /* Not released (or not in the manifest at all):
                   nothing a reload could add. */
                return false;
            }

            spec.reload(released);

            return holds(spec.held(), id);

        } catch (error) {
            console.error(
                "[LibrarySync] Unable to refresh the " + section + " library.",
                error
            );

            return false;
        }
    }

    function isOpen(section, id) {
        const spec = SECTIONS[section];

        if (!spec) {
            return null;
        }

        try {
            const current = spec.open();

            if (current === undefined) {
                return null;
            }

            return !!current && sameId(current.id, id);

        } catch (error) {
            return null;
        }
    }

    return {
        ensure,
        isOpen
    };

})();
