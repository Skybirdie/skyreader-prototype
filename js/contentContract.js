"use strict";

/*
=========================================================
 SkyMedia Unified Content Contract — C1.0

 One canonical manifest for:
   book
   video
   slideshow

 Responsibilities:
 • Normalize local content.json and Glide payloads identically.
 • Preserve declared metadata for diagnostics.
 • Correct derived counts from trustworthy source data.
 • Tolerate common Glide formatting problems.
 • Infer slideshow source when source/url disagree.
 • Keep viewer-specific compatibility fields flat internally.

 Canonical source shape:

 {
   "version":"1.0",
   "content":[
     {
       "id":"...",
       "type":"book|video|slideshow",
       "title":"...",
       "subtitle":"...",
       "thumbnail":"...",
       "category":"...",
       "dateAdd":"YYYYMMDDHHmm",
       "date":"YYYYMMDDHHmm",
       "author":"...",
       "book": { "url":"...", "pageCount": 11 },
       "video": { "url":"...", "length":"..." },
       "slideshow": {
         "source":"images",
         "slides":[...]
       },
       "audio": {
         "url":"...",
         "type":"background",
         "autoplay":true,
         "loop":true
       }
     }
   ]
 }

 Derived count policy:
 • image slideshow: actual count = valid slides.length
 • PDF slideshow: actual count = discovered from PDF when opened
 • book: actual count = discovered by PDF.js when opened
 • supplied count is retained as declaredPageCount/declaredSlideCount
=========================================================
*/

window.ContentContract = (function () {

    const IMAGE_EXTENSIONS = /\.(avif|gif|jpe?g|png|webp|bmp|svg)(?:[?#].*)?$/i;
    const PDF_EXTENSION = /\.pdf(?:[?#].*)?$/i;

    function clean(value, fallback = "") {
        if (value === null || value === undefined) return fallback;
        return typeof value === "string" ? value.trim() : value;
    }


function normalizeYouTubeUrl(value) {
    const raw = url(value);
    if (!raw) return "";

    try {
        const parsed = new URL(raw);
        const hostname = parsed.hostname.toLowerCase();

        // Standard YouTube watch URL
        if (
            hostname === "www.youtube.com" ||
            hostname === "youtube.com" ||
            hostname === "m.youtube.com"
        ) {
            if (parsed.pathname === "/watch") {
                const videoId = parsed.searchParams.get("v");

                if (videoId) {
                    return `https://www.youtube.com/embed/${videoId}`;
                }
            }

            // Already an embed URL
            if (parsed.pathname.startsWith("/embed/")) {
                const videoId =
                    parsed.pathname
                        .split("/embed/")[1]
                        .split("/")[0];

                if (videoId) {
                    return `https://www.youtube.com/embed/${videoId}`;
                }
            }
        }

        // Short YouTube URL
        if (hostname === "youtu.be") {
            const videoId =
                parsed.pathname
                    .replace(/^\/+/, "")
                    .split("/")[0];

            if (videoId) {
                return `https://www.youtube.com/embed/${videoId}`;
            }
        }

    } catch (error) {
        // Leave malformed/non-standard URLs unchanged.
    }

    return raw;
}

function isYouTubeUrl(value) {
    const raw = url(value);
    if (!raw) return false;

    try {
        const parsed = new URL(raw);
        const hostname = parsed.hostname.toLowerCase();

        return (
            hostname === "www.youtube.com" ||
            hostname === "youtube.com" ||
            hostname === "m.youtube.com" ||
            hostname === "youtu.be"
        );

    } catch (error) {
        return false;
    }
}


    function unwrapMarkdownUrl(value) {
        if (typeof value !== "string") return value;
        let text = value.trim();
        const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (match) text = match[2].trim();
        return text;
    }

    function url(value) {
        return unwrapMarkdownUrl(clean(value, ""));
    }

    function numberOrNull(value) {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }

    function dateValue(value, fallback = "") {
        const raw = clean(value, "");
        if (window.SkyDate && typeof SkyDate.dateAddOrNow === "function") {
            return SkyDate.dateAddOrNow(raw || fallback);
        }
        return raw || fallback || "";
    }

    function visible(date) {
        return !window.SkyDate || typeof SkyDate.isVisible !== "function" || SkyDate.isVisible(date);
    }

    function normalizeAudio(item) {
        const raw = item && (item.audio ?? item.audioUrl ?? item.soundtrack);
        if (!raw) return null;

        if (typeof raw === "string") {
            const audioUrl = url(raw);
            return audioUrl ? {
                url: audioUrl,
                type: "background",
                autoplay: true,
                loop: true
            } : null;
        }

        if (typeof raw === "object") {
            const audioUrl = url(raw.url ?? raw.audioUrl ?? raw.src);
            if (!audioUrl) return null;
            return {
                url: audioUrl,
                type: clean(raw.type, "background") || "background",
                autoplay: raw.autoplay === undefined ? true : Boolean(raw.autoplay),
                loop: raw.loop === undefined ? true : Boolean(raw.loop)
            };
        }

        return null;
    }

    function normalizeSlide(slide) {
        if (typeof slide === "string") {
            const image = url(slide);
            return image ? { image, duration: 5 } : null;
        }

        if (!slide || typeof slide !== "object") return null;

        const image = url(
            slide.image ??
            slide.img ??
            slide.src ??
            slide.url ??
            slide.imageUrl
        );

        if (!image) return null;

        let duration = Number(slide.duration ?? slide.seconds ?? 5);
        if (!Number.isFinite(duration) || duration <= 0) duration = 5;

        return {
            image,
            duration,
            title: clean(slide.title, ""),
            caption: clean(slide.caption, ""),
            audio: url(slide.audio ?? slide.audioUrl ?? "")
        };
    }

    function parseSlides(value) {
        if (!value) return [];

        if (Array.isArray(value)) {
            return value.map(normalizeSlide).filter(Boolean);
        }

        if (typeof value === "string") {
            const text = value.trim();
            if (!text) return [];

            try {
                return parseSlides(JSON.parse(text));
            } catch (error) {
                const objects = splitJsonObjects(text);
                if (objects.length) {
                    return objects.map(piece => {
                        try { return normalizeSlide(JSON.parse(piece)); }
                        catch (e) { return null; }
                    }).filter(Boolean);
                }

                /*
                 * Not JSON at all, and no embedded {...} objects —
                 * this is just a bare image URL (or a comma/newline
                 * separated list of them). Treat each one as a
                 * single slide rather than silently discarding the
                 * whole item. This is what lets a plain "url" field
                 * work interchangeably with a real "slides" array.
                 */
                return text
                    .split(/[\n,]+/)
                    .map(piece => normalizeSlide(piece.trim()))
                    .filter(Boolean);
            }
        }

        if (typeof value === "object") {
            if (Array.isArray(value.slides)) return parseSlides(value.slides);
            if (Array.isArray(value.images)) return parseSlides(value.images);
            return [normalizeSlide(value)].filter(Boolean);
        }

        return [];
    }

    function splitJsonObjects(text) {
        const results = [];
        let depth = 0;
        let inString = false;
        let escaped = false;
        let start = -1;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (ch === "\\") {
                escaped = true;
                continue;
            }

            if (ch === '"') {
                inString = !inString;
                continue;
            }

            if (inString) continue;

            if (ch === "{") {
                if (depth === 0) start = i;
                depth++;
            } else if (ch === "}") {
                depth--;
                if (depth === 0 && start >= 0) {
                    results.push(text.slice(start, i + 1));
                    start = -1;
                }
            }
        }

        return results;
    }

    function common(raw, index, type) {
        const source = raw && typeof raw === "object" ? raw : {};
        const dateAdd = dateValue(
            source.dateAdd ?? source.date_added ?? source.addedDate,
            ""
        );

const date = clean(
    source.date ?? source.releaseDate ?? source.Date,
    ""
);

        return {
            id: clean(source.id ?? source.ID ?? source.slug, "") ||
               `${type}-${index + 1}`,
            type,
            title: clean(source.title ?? source.Title, "") || `Untitled ${type}`,
            subtitle: clean(source.subtitle ?? source.Subtitle, ""),
            thumbnail: url(
                source.thumbnail ??
                source.Thumbnail ??
                source.cover ??
                source.image ??
                ""
            ),
            category: clean(source.category ?? source.Category, "Uncategorized") || "Uncategorized",
            dateAdd,
            date,
            author: clean(source.author ?? source.Author, "unknown") || "unknown"
        };
    }

    function normalizeBook(raw, index = 0) {
        const source = raw || {};
        const nested = source.book && typeof source.book === "object" ? source.book : {};

        const pdf = url(
            nested.url ??
            nested.pdf ??
            source.pdf ??
            source.url ??
            source.URL ??
            ""
        );

        const declared = numberOrNull(
            nested.pageCount ??
            nested.page_count ??
            source.pageCount ??
            source.page_count
        );

        const item = {
            ...common(source, index, "book"),
            pdf,
            pageCount: declared ?? "unknown",
            declaredPageCount: declared,
            countSource: "declared"
        };

        if (!item.thumbnail) item.thumbnail = "assets/default-thumbnail.png";
        return item;
    }

    function normalizeVideo(raw, index = 0) {
        const source = raw || {};
        const nested = source.video && typeof source.video === "object" ? source.video : {};

        const item = {
            ...common(source, index, "video"),

video: normalizeYouTubeUrl(
    nested.url ??
    nested.video ??
    source.video ??
    source.videoUrl ??
    source.videoURL ??
    source.url ??
    source.URL ??
    ""
),
            length: clean(
                nested.length ??
                nested.duration ??
                source.videoLength ??
                source.length ??
                ""
            ),
            width: clean(nested.width ?? source.width ?? "", ""),
            height: clean(nested.height ?? source.height ?? "", "")
        };

        if (!item.thumbnail) item.thumbnail = "assets/default-thumbnail.png";
        return item;


    }

    function normalizeSlideshow(raw, index = 0) {
        const source = raw || {};

        /*
         * Idempotency guard.
         *
         * This function is designed to read RAW/Glide-shaped input:
         * a nested `source.slideshow` object, or flat raw fields like
         * `slideshowSource`. But it also gets called on items that
         * have ALREADY been through this exact function once (see
         * ContentContract.normalize() -> normalizeSlideshow(), which
         * runs again inside SlideshowContract.parse()). An already-
         * normalized item carries its authoritative identity in flat
         * OUTPUT fields (`source`, `pdfUrl`, `slides`), not the raw
         * fields this function otherwise looks for — so re-deriving
         * from those (now-absent) raw fields was silently discarding
         * a correctly-identified PDF and turning it into an empty
         * "images" item with no slides.
         *
         * If the item already carries a valid, self-consistent
         * identity, trust it and pass it through unchanged rather
         * than re-deriving.
         */
        const alreadyNormalized =
            (source.source === "pdf" && !!source.pdfUrl) ||
            (source.source === "images" &&
                Array.isArray(source.slides) &&
                source.slides.length > 0);

        if (alreadyNormalized) {
            return { ...source };
        }

        const nested = source.slideshow && typeof source.slideshow === "object"
            ? source.slideshow
            : {};

        const declared = numberOrNull(
            nested.slideCount ??
            nested.slide_count ??
            source.slideCount ??
            source.slide_count
        );

        /*
         * Priority order for deciding pdf vs. images:
         *
         * 1. A field whose NAME is unambiguous — a dedicated `pdf`
         *    field, or a real `slides`/`images` array — is trusted
         *    outright. The field itself is the strongest signal,
         *    regardless of anything else.
         * 2. A single generic `url` field is ambiguous by name
         *    alone, so its actual file extension is used as
         *    evidence: a .pdf extension means pdf, a known image
         *    extension means a single image slide. This lets a
         *    mislabeled "source" — in either direction — correct
         *    itself instead of the whole item silently vanishing.
         * 3. Only when the url's extension is unrecognized (or
         *    there's no url at all) do we fall back to whatever
         *    "source" was declared, defaulting to images if that's
         *    also absent — a visibly-broken image slide is far
         *    easier to notice and fix than an item that's just gone.
         */

        const explicitPdfUrl = url(
            nested.pdf ??
            source.pdfUrl ??
            source.pdf ??
            ""
        );

        let slides = parseSlides(
            nested.slides ??
            nested.images ??
            source.slides ??
            source.images ??
            ""
        );

        const genericUrl = url(nested.url ?? source.slideshowUrl ?? "");

        let pdfUrl = "";
        let requestedSource = "";

        if (explicitPdfUrl) {
            pdfUrl = explicitPdfUrl;
            requestedSource = "pdf";
            slides = [];
        } else if (slides.length) {
            requestedSource = "images";
        } else if (genericUrl && PDF_EXTENSION.test(genericUrl)) {
            pdfUrl = genericUrl;
            requestedSource = "pdf";
        } else if (genericUrl && IMAGE_EXTENSIONS.test(genericUrl)) {
            requestedSource = "images";
            slides = parseSlides(genericUrl);
        } else if (genericUrl) {
            const declaredSource = String(
                nested.source ?? source.slideshowSource ?? ""
            ).trim().toLowerCase();

            if (declaredSource === "pdf") {
                pdfUrl = genericUrl;
                requestedSource = "pdf";
            } else {
                requestedSource = "images";
                slides = parseSlides(genericUrl);
            }
        } else {
            requestedSource = "images";
        }

        const audioConfig = normalizeAudio(source);

        const item = {
            ...common(source, index, "slideshow"),
            slides,
            pdfUrl: pdfUrl || "",
            source: requestedSource,
            /*
             * Viewer compatibility:
             *   audio      = playable URL
             *   audioConfig = full contract object
             */
            audio: audioConfig ? audioConfig.url : "",
            audioConfig,
            declaredSlideCount: declared,
            slideCount: pdfUrl ? (declared ?? "unknown") : slides.length,
            countSource: pdfUrl ? "declared-unverified" : "derived"
        };

        if (!item.thumbnail) {
            item.thumbnail =
                slides[0]?.image ||
                "assets/default-thumbnail.png";
        }

        return item;
    }

    function normalize(raw, index = 0) {
        if (!raw || typeof raw !== "object") return null;

        const type = String(
            raw.type ??
            (raw.book ? "book" :
             raw.video ? "video" :
             raw.slideshow ? "slideshow" : "")
        ).trim().toLowerCase();

        if (type === "book") return normalizeBook(raw, index);
        if (type === "video") return normalizeVideo(raw, index);
        if (type === "slideshow") return normalizeSlideshow(raw, index);

        return null;
    }

    function parse(payload) {
        if (!payload) return [];

        if (Array.isArray(payload)) {
            return payload.map(normalize).filter(Boolean);
        }

        if (typeof payload === "object") {
            if (Array.isArray(payload.content)) return payload.content.map(normalize).filter(Boolean);
            if (Array.isArray(payload.items)) return payload.items.map(normalize).filter(Boolean);
            if (Array.isArray(payload.books)) return payload.books.map((x, i) => normalize({...x, type:"book"}, i)).filter(Boolean);
            if (Array.isArray(payload.videos)) return payload.videos.map((x, i) => normalize({...x, type:"video"}, i)).filter(Boolean);
            if (Array.isArray(payload.slideshows)) return payload.slideshows.map((x, i) => normalize({...x, type:"slideshow"}, i)).filter(Boolean);
            return [normalize(payload)].filter(Boolean);
        }

        if (typeof payload !== "string") return [];

        const text = payload.trim();
        if (!text) return [];

        try {
            return parse(JSON.parse(text));
        } catch (error) {
            const objects = splitJsonObjects(text);
            if (!objects.length) return [];
            return objects.map((piece, i) => {
                try { return normalize(JSON.parse(piece), i); }
                catch (e) { return null; }
            }).filter(Boolean);
        }
    }

    function normalizeManifest(rawManifest) {
        const items = parse(rawManifest);
        const diagnostics = [];
        const visibleItems = [];

        items.forEach(item => {
            if (!visible(item.date)) return;

            if (!item.id) {
                diagnostics.push("Content item without an id was ignored.");
                return;
            }

            if (item.type === "book") {
                if (!item.pdf) {
                    diagnostics.push(`${item.id}: book has no PDF URL and was ignored.`);
                    return;
                }
            }

            if (item.type === "video") {
                if (!item.video) {
                    diagnostics.push(`${item.id}: video has no video URL and was ignored.`);
                    return;
                }
            }

            if (item.type === "slideshow") {
                if (item.source === "images" && !item.slides.length) {
                    diagnostics.push(`${item.id}: slideshow has no image slides and was ignored.`);
                    return;
                }
                if (item.source === "pdf" && !item.pdfUrl) {
                    diagnostics.push(`${item.id}: PDF slideshow has no PDF URL and was ignored.`);
                    return;
                }
            }

            if (item.type === "slideshow" &&
                item.source === "images" &&
                item.declaredSlideCount !== null &&
                item.declaredSlideCount !== item.slides.length) {
                diagnostics.push(
                    `${item.id}: corrected slideCount ${item.declaredSlideCount} → ${item.slides.length}.`
                );
            }

            visibleItems.push(item);
        });

        const rawFrontPage = rawManifest && typeof rawManifest === "object"
            ? rawManifest.frontPage
            : null;
        const frontCategories = rawFrontPage && Array.isArray(rawFrontPage.categories)
            ? rawFrontPage.categories.map(v => String(v || "").trim()).filter(Boolean)
            : [];

        if (frontCategories.length && frontCategories.length !== 7) {
            diagnostics.push(`Front Page requires exactly seven categories; received ${frontCategories.length}.`);
        }

        return {
            version: "1.0",
            content: visibleItems,
            frontPage: {
                categories: frontCategories.length === 7 ? frontCategories : []
            },
            diagnostics
        };
    }

    function byType(items, type) {
        return (items || []).filter(item => item && item.type === type);
    }

    function reconcileBookCount(book, actualCount) {
        if (!book || book.type !== "book") return book;
        const actual = Number(actualCount);
        if (!Number.isFinite(actual) || actual < 0) return book;

        book.declaredPageCount =
            book.declaredPageCount === undefined
                ? numberOrNull(book.pageCount)
                : book.declaredPageCount;

        book.pageCount = actual;
        book.countSource = "pdf";
        return book;
    }

    function reconcileSlideshowCount(slideshow, actualCount) {
        if (!slideshow || slideshow.type !== "slideshow") return slideshow;
        const actual = Number(actualCount);
        if (!Number.isFinite(actual) || actual < 0) return slideshow;

        slideshow.declaredSlideCount =
            slideshow.declaredSlideCount === undefined
                ? numberOrNull(slideshow.slideCount)
                : slideshow.declaredSlideCount;

        slideshow.slideCount = actual;
        slideshow.countSource = "pdf";
        return slideshow;
    }

return {
    parse,
    normalize,
    normalizeBook,
    normalizeVideo,
    normalizeSlideshow,
    normalizeSlide,
    normalizeAudio,
    normalizeManifest,
    reconcileBookCount,
    reconcileSlideshowCount,
    unwrapMarkdownUrl,
    isYouTubeUrl,
    normalizeYouTubeUrl,
    splitJsonObjects
};

})();