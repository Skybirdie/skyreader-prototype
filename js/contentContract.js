"use strict";

/*
=========================================================
 SkyMedia Content Contract — C3.1

 Authoritative internal content model
 ------------------------------------

 Every content item ultimately becomes:

 {
   id: "...",
   type: "book" | "video" | "slideshow",
   title: "...",
   subtitle: "...",
   thumbnail: "...",
   media: "...",
   audio: "...",
   author: "...",
   category: "...",
   date: "..."
 }

 Media rules
 -----------

 BOOK
   media = PDF URL string

 VIDEO
   media = video URL string

 SLIDESHOW / PDF
   media = PDF URL string

 SLIDESHOW / IMAGES
   media = array of image URLs

 AUDIO
   audio = URL string
   audio = "" when absent

 Optional fields are allowed to be empty.

 The contract is deliberately forgiving:
 one malformed content item should never destroy
 the entire content collection.

=========================================================
*/

window.ContentContract = (function () {

    const api = {};


    /* =====================================================
       HELPERS
    ===================================================== */

    function string(value) {

        if (
            value === undefined ||
            value === null
        ) {
            return "";
        }

        return String(value).trim();
    }


    function markdownUrl(value) {

        let text =
            string(value);

        if (!text) {
            return "";
        }

        /*
         Glide URL:

           [URL](URL)
        */

        const match =
            text.match(
                /^\[([^\]]+)\]\(([^)]+)\)$/
            );

        if (match) {

            return string(
                match[2] ||
                match[1]
            );
        }

        return text;
    }


    function urlList(value) {

        if (Array.isArray(value)) {

            return value
                .flatMap(item =>
                    urlList(item)
                )
                .filter(Boolean);
        }

        const text =
            string(value);

        if (!text) {
            return [];
        }

        /*
         Support a JSON array stored as text.
        */

        if (
            text.startsWith("[") &&
            text.endsWith("]")
        ) {

            try {

                const parsed =
                    JSON.parse(text);

                if (
                    Array.isArray(parsed)
                ) {

                    return parsed
                        .flatMap(item =>
                            urlList(item)
                        )
                        .filter(Boolean);
                }

            } catch (error) {
                /*
                 Continue with forgiving parsing.
                */
            }
        }

        /*
         Glide's common format:

         [url1](url1), [url2](url2), [url3](url3)
        */

        let parts =
            text.split(
                /\s*,\s*(?=\[)/g
            );

        /*
         Plain comma-separated URLs.
        */

        if (
            parts.length === 1 &&
            text.includes(",")
        ) {

            parts =
                text.split(",");
        }

        return parts
            .map(item =>
                markdownUrl(item)
            )
            .filter(Boolean);
    }


    function firstUrl(value) {

        const list =
            urlList(value);

        return list.length
            ? list[0]
            : "";
    }


    function normalizeDate(value) {

        return string(value);
    }


function isYouTubeUrl(value) {
    return /youtube\.com|youtu\.be/i.test(string(value));
}


function extractYouTubeId(value) {

    const url = string(value);

    // Covers: watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID,
    // with or without extra query params/timestamps after the ID.
    const match = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );

    return match ? match[1] : "";
}


function toYouTubeEmbedUrl(value) {

    const id = extractYouTubeId(value);

    return id
        ? `https://www.youtube.com/embed/${id}`
        : string(value);
}


    function isVideoUrl(value) {
        return isYouTubeUrl(value) || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(string(value));
    }


    function isPdfUrl(value) {
        return /\.pdf(\?|#|$)/i.test(string(value));
    }


    function slideObjects(value) {
        return urlList(value).map(url => ({ image: url }));
    }


    /* =====================================================
       TYPE DETECTION
    ===================================================== */

    function detectType(raw) {

        if (
            !raw ||
            typeof raw !== "object"
        ) {
            return "";
        }

        const supplied =
            string(raw.type)
                .toLowerCase();

        if (
            supplied === "book" ||
            supplied === "books" ||
            supplied === "pdf" ||
            supplied === "reader"
        ) {
            return "book";
        }

        if (
            supplied === "video" ||
            supplied === "videos"
        ) {
            return "video";
        }

        if (
            supplied === "slideshow" ||
            supplied === "slideshows" ||
            supplied === "slide-show" ||
            supplied === "slides"
        ) {
            return "slideshow";
        }

        /*
         Legacy structure detection.
        */

        if (raw.video) {
            return "video";
        }

        if (raw.slideshow) {
            return "slideshow";
        }

        if (raw.book) {
            return "book";
        }

        /*
         Last-resort media detection.

         This is intentionally conservative.
        */

        const media =
            firstUrl(raw.media);

        if (media) {

            if (
                /youtube\.com|youtu\.be/i.test(
                    media
                )
            ) {
                return "video";
            }

            if (
                /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(
                    media
                )
            ) {
                return "video";
            }

            if (
                Array.isArray(raw.media)
            ) {
                return "slideshow";
            }

            if (
                urlList(raw.media).length > 1
            ) {
                return "slideshow";
            }

            if (
                /\.pdf(\?|#|$)/i.test(
                    media
                )
            ) {
                return "book";
            }
        }

        return "";
    }


    /* =====================================================
       MEDIA EXTRACTION
    ===================================================== */

    function extractMedia(
        raw,
        type
    ) {

        /*
         --------------------------------------------------
         New universal contract
         --------------------------------------------------
        */

        if (
            raw.media !== undefined &&
            raw.media !== null
        ) {

            const list =
                urlList(
                    raw.media
                );

            if (
                type === "slideshow"
            ) {

                if (
                    list.length === 1
                ) {
                    return list[0];
                }

                return list;
            }

            return list[0] || "";
        }


        /*
         --------------------------------------------------
         Legacy book
         --------------------------------------------------
        */

        if (raw.book) {

            if (
                typeof raw.book === "string"
            ) {

                return firstUrl(
                    raw.book
                );
            }

            if (
                raw.book.url
            ) {

                return firstUrl(
                    raw.book.url
                );
            }
        }


        /*
         --------------------------------------------------
         Legacy video
         --------------------------------------------------
        */

        if (raw.video) {

            if (
                typeof raw.video === "string"
            ) {

                return firstUrl(
                    raw.video
                );
            }

            if (
                raw.video.url
            ) {

                return firstUrl(
                    raw.video.url
                );
            }
        }


        /*
         --------------------------------------------------
         Legacy slideshow
         --------------------------------------------------
        */

        if (raw.slideshow) {

            if (
                typeof raw.slideshow ===
                "string"
            ) {

                return firstUrl(
                    raw.slideshow
                );
            }

            if (
                raw.slideshow.url
            ) {

                return firstUrl(
                    raw.slideshow.url
                );
            }

            if (
                Array.isArray(
                    raw.slideshow.slides
                )
            ) {

                return raw.slideshow.slides
                    .flatMap(item =>
                        urlList(item)
                    )
                    .filter(Boolean);
            }
        }


        return type === "slideshow"
            ? []
            : "";
    }


    /* =====================================================
       AUDIO
    ===================================================== */

    function extractAudio(raw) {

        if (!raw) {
            return "";
        }

        if (
            typeof raw.audio ===
            "string"
        ) {

            return firstUrl(
                raw.audio
            );
        }

        if (
            raw.audio &&
            typeof raw.audio ===
            "object"
        ) {

            return firstUrl(
                raw.audio.url
            );
        }

        return "";
    }


    /* =====================================================
       SINGLE ITEM NORMALIZATION
    ===================================================== */

    function normalize(
        raw,
        index = 0
    ) {

        if (
            !raw ||
            typeof raw !== "object"
        ) {

            console.warn(
                "[ContentContract] Ignoring invalid item:",
                index
            );

            return null;
        }

        try {

            const type =
                detectType(raw);


            /*
             Keep optional values empty rather than
             inventing "unknown".
            */

            const item = {

                id:
                    string(raw.id) ||
                    `content-${index + 1}`,

                type:
                    type,

                title:
                    string(raw.title),

                subtitle:
                    string(raw.subtitle),

                thumbnail:
                    firstUrl(
                        raw.thumbnail
                    ),

                media:
                    extractMedia(
                        raw,
                        type
                    ),

                audio:
                    extractAudio(raw),

                author:
                    string(raw.author),

                category:
                    string(raw.category),

                date:
                    normalizeDate(
                        raw.date
                    )
            };

            /*
             Preserve the Glide deep-link supplied by the C2.2
             generator.  It is intentionally kept outside the
             authoritative media fields because it is used only
             when creating a user-facing share link.
            */

            const glideUrl =
                markdownUrl(
                    raw.glideUrl
                );

            if (glideUrl) {
                item.glideUrl = glideUrl;
            }


            /*
             dateAdd (upload provenance) is intentionally never used
             to substitute for a missing "date" (the publish/release
             gate) -- see librarySorter.js, slideshowSorter.js, and
             videoSorter.js, which document the same separation. An
             item with no valid date has not been scheduled for
             release and must stay invisible per SkyDate.isVisible().
            */


            /*
             --------------------------------------------------
             RUNTIME COMPATIBILITY PROJECTIONS
             --------------------------------------------------
             The authoritative contract remains media/audio/date.
             Existing section engines still consume a few historical
             shapes, so they are projected here at one boundary.
            */

            if (type === "book") {
                const url = Array.isArray(item.media) ? (item.media[0] || "") : (item.media || "");
                item.pdf = url;
                item.book = { url, pdf: url, pageCount: 0 };
                item.pageCount = 0;
            }

            if (type === "video") {
                const url = Array.isArray(item.media) ? (item.media[0] || "") : (item.media || "");
                const legacyLength = raw.video && typeof raw.video === "object" ? string(raw.video.length) : string(raw.videoLength);
                item.video = url;
                item.videoUrl = url;
                item.videoLength = legacyLength;
                item.videoInfo = { url, length: legacyLength };
            }

            if (type === "slideshow") {
                const media = item.media;
                const urls = Array.isArray(media) ? media.filter(Boolean) : (media ? [media] : []);
                const first = urls[0] || "";

                if (first && isPdfUrl(first) && urls.length === 1) {
                    item.source = "pdf";
                    item.pdfUrl = first;
                    item.slides = [];
                    item.slideCount = 0;
                    item.slideshow = { source: "pdf", url: first, slides: [] };
                } else {
                    item.source = "images";
                    item.pdfUrl = "";
                    item.slides = urls.map(url => ({ image: url }));
                    item.slideCount = item.slides.length;
                    item.slideshow = { source: "images", slides: item.slides.map(slide => ({ ...slide })) };
                }
            }

            /*
             If an item has no explicit type, do not
             automatically throw it away.

             Leave type empty so diagnostics can reveal
             the problem and the application can decide
             how to handle it.
            */

            return item;

        } catch (error) {

            console.warn(
                "[ContentContract] Failed to normalize item",
                index,
                error,
                raw
            );

            return null;
        }
    }


    /* =====================================================
       COLLECTION EXTRACTION
    ===================================================== */

    function extractContent(
        rawManifest
    ) {

        if (!rawManifest) {
            return [];
        }

        if (
            Array.isArray(rawManifest)
        ) {

            return rawManifest;
        }

        if (
            Array.isArray(
                rawManifest.content
            )
        ) {

            return rawManifest.content;
        }


        /*
         Legacy manifests.
        */

        const content = [];


        if (
            Array.isArray(
                rawManifest.books
            )
        ) {

            content.push(
                ...rawManifest.books
            );
        }


        if (
            Array.isArray(
                rawManifest.videos
            )
        ) {

            content.push(
                ...rawManifest.videos
            );
        }


        if (
            Array.isArray(
                rawManifest.slideshows
            )
        ) {

            content.push(
                ...rawManifest.slideshows
            );
        }


        return content;
    }


    /* =====================================================
       MANIFEST NORMALIZATION
    ===================================================== */

    function normalizeManifest(
        rawManifest
    ) {

        const rawContent =
            extractContent(
                rawManifest
            );

        const content = [];
        const diagnostics = [];


        for (
            let i = 0;
            i < rawContent.length;
            i++
        ) {

            try {

                const item =
                    normalize(
                        rawContent[i],
                        i
                    );

                if (item) {

                    content.push(
                        item
                    );
                }

            } catch (error) {

                /*
                 Extra safety layer:

                 one bad record cannot kill the
                 entire collection.
                */

                console.warn(
                    "[ContentContract] Skipping malformed item",
                    i,
                    error
                );
            }
        }


        /*
         --------------------------------------------------
         ID COLLISION FALLBACK
         --------------------------------------------------
         `id` is relied on everywhere downstream (library
         lookups, favorites, recently-read, front page
         hand-off) to mean "exactly one item". Glide data is
         hand-entered and can legitimately produce two rows
         that share an id -- a copy-pasted row, a duplicated
         fallback like "content-3", etc.

         Without a fallback here, a lookup such as
         `library.find(book => book.id === id)` silently
         returns whichever of the two items happens to come
         first, so a second/newer item can appear to "merge"
         into an older one with the same id.

         The first item to use a given id keeps it unchanged
         (so existing bookmarks/favorites/recent-read entries
         keep working). Every later item with the same id is
         given a new, stable, unique id so it can never be
         confused with the item(s) before it.
        */

        dedupeContentIds(
            content,
            diagnostics
        );


        return {
            version: string(rawManifest && rawManifest.version),
            content: content,
            frontPage: rawManifest && rawManifest.frontPage && typeof rawManifest.frontPage === "object"
                ? { ...rawManifest.frontPage, categories: Array.isArray(rawManifest.frontPage.categories) ? [...rawManifest.frontPage.categories] : [] }
                : { categories: [] },
            background: string(rawManifest && rawManifest.background),
            diagnostics: diagnostics
        };
    }


    /* =====================================================
       ID COLLISION FALLBACK
    ===================================================== */

    function dedupeContentIds(
        content,
        diagnostics
    ) {

        const seen = new Map();

        for (
            let i = 0;
            i < content.length;
            i++
        ) {

            const item = content[i];
            const originalId = item.id;
            const timesSeen = seen.get(originalId) || 0;

            if (timesSeen > 0) {

                let newId =
                    `${originalId}-dup${timesSeen + 1}`;

                /*
                 Guard against the generated id itself
                 already being in use (extremely unlikely,
                 but never assume).
                */

                while (seen.has(newId)) {
                    newId = `${newId}-x`;
                }

                const message =
                    `[ContentContract] Duplicate id "${originalId}" found on "${item.title || item.type}" ` +
                    `(item ${i + 1}) -- reassigned to "${newId}" so it is not confused with the earlier item ` +
                    `using that id.`;

                console.warn(message);

                diagnostics.push(message);

                item.id = newId;

                seen.set(newId, 1);
            }

            seen.set(
                originalId,
                timesSeen + 1
            );
        }
    }


    /* =====================================================
       SECTION HELPERS
    ===================================================== */

    function normalizeBook(raw, index = 0) {
        const item = normalize(raw, index);
        if (!item) return null;
        item.type = "book";
        const url = Array.isArray(item.media) ? (item.media[0] || "") : (item.media || "");
        item.pdf = url;
        item.book = { url, pdf: url, pageCount: 0 };
        item.pageCount = 0;
        return item;
    }


    function normalizeVideo(raw, index = 0) {
        const item = normalize(raw, index);
        if (!item) return null;
        item.type = "video";
        const url = Array.isArray(item.media) ? (item.media[0] || "") : (item.media || "");
        item.video = url;
        item.videoUrl = url;
        item.videoLength = item.videoLength || "";
        item.videoInfo = { url, length: item.videoLength };
        return item;
    }


    function normalizeSlideshow(raw, index = 0) {
        const item = normalize(raw, index);
        if (!item) return null;
        item.type = "slideshow";
        const media = item.media;
        const urls = Array.isArray(media) ? media.filter(Boolean) : (media ? [media] : []);
        const first = urls[0] || "";
        if (first && isPdfUrl(first) && urls.length === 1) {
            item.source = "pdf";
            item.pdfUrl = first;
            item.slides = [];
            item.slideCount = 0;
            item.slideshow = { source: "pdf", url: first, slides: [] };
        } else {
            item.source = "images";
            item.pdfUrl = "";
            item.slides = urls.map(url => ({ image: url }));
            item.slideCount = item.slides.length;
            item.slideshow = { source: "images", slides: item.slides.map(slide => ({ ...slide })) };
        }
        return item;
    }


    function parse(payload) {
        return extractContent(payload).map((raw, index) => normalize(raw, index)).filter(Boolean);
    }


    function normalizeSlide(slide) {
        if (typeof slide === "string") return { image: firstUrl(slide) };
        if (slide && typeof slide === "object") {
            return {
                image: firstUrl(slide.image || slide.url || slide.src),
                title: string(slide.title),
                caption: string(slide.caption),
                duration: Number(slide.duration) || undefined
            };
        }
        return { image: "" };
    }


    function reconcileBookCount(book, actualCount) {
        const count = Number(actualCount) || 0;
        if (book) { book.pageCount = count; if (book.book) book.book.pageCount = count; }
        return book;
    }


    function reconcileSlideshowCount(slideshow, actualCount) {
        const count = Number(actualCount) || 0;
        if (slideshow) { slideshow.pdfPageCount = count; slideshow.slideCount = count; }
        return slideshow;
    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    api.normalize =
        normalize;

    api.normalizeManifest =
        normalizeManifest;

    api.normalizeBook =
        normalizeBook;

    api.normalizeVideo =
        normalizeVideo;

    api.normalizeSlideshow =
        normalizeSlideshow;

    api.extractContent =
        extractContent;

    api.parse =
        parse;

    api.normalizeSlide =
        normalizeSlide;

    api.reconcileBookCount =
        reconcileBookCount;

    api.reconcileSlideshowCount =
        reconcileSlideshowCount;

    api.isYouTubeUrl =
        isYouTubeUrl;

api.isYouTubeUrl =
    isYouTubeUrl;

api.toYouTubeEmbedUrl =
    toYouTubeEmbedUrl;

    api.unwrapMarkdownUrl =
        markdownUrl;


    /*
     Useful diagnostics while testing Glide.
    */

    api.debug = {

        detectType:
            detectType,

        extractMedia:
            extractMedia,

        extractAudio:
            extractAudio,

        urlList:
            urlList,

        normalize:
            normalize,

        normalizeManifest:
            normalizeManifest
    };


    return api;

})();