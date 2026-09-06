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
             Legacy dateAdd compatibility.

             New Glide data should use date.
            */

            if (
                !item.date &&
                raw.dateAdd
            ) {

                item.date =
                    normalizeDate(
                        raw.dateAdd
                    );
            }


            /*
             Legacy metadata retained only where useful
             to existing section engines.
            */

            if (
                raw.book &&
                typeof raw.book ===
                "object"
            ) {

                item.book = {

                    url:
                        firstUrl(
                            item.media
                        ),

                    pageCount:
                        Number(
                            raw.book.pageCount
                        ) || 0
                };
            }


            if (
                type === "book" &&
                !item.book
            ) {

                item.book = {

                    url:
                        Array.isArray(
                            item.media
                        )
                            ? item.media[0] || ""
                            : item.media || "",

                    pageCount: 0
                };
            }


            if (
                raw.video &&
                typeof raw.video ===
                "object"
            ) {

                item.videoLength =
                    string(
                        raw.video.length
                    );
            }

            if (
                raw.videoLength
            ) {

                item.videoLength =
                    string(
                        raw.videoLength
                    );
            }


            if (
                type === "video"
            ) {

                item.video = {

                    url:
                        Array.isArray(
                            item.media
                        )
                            ? item.media[0] || ""
                            : item.media || "",

                    length:
                        item.videoLength ||
                        ""
                };
            }


            if (
                type === "slideshow"
            ) {

                if (
                    Array.isArray(
                        item.media
                    )
                ) {

                    item.slideshow = {

                        source:
                            "images",

                        slides:
                            item.media.slice()
                    };

                    item.slideCount =
                        item.media.length;

                } else {

                    item.slideshow = {

                        source:
                            "pdf",

                        url:
                            item.media || ""
                    };

                    item.slideCount =
                        Number(
                            raw.slideCount
                        ) || 0;
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


        return {
            content: content
        };
    }


    /* =====================================================
       SECTION HELPERS
    ===================================================== */

    function normalizeBook(
        raw,
        index = 0
    ) {

        const item =
            normalize(
                raw,
                index
            );

        if (!item) {
            return null;
        }

        item.type = "book";

        item.book = {

            url:
                Array.isArray(
                    item.media
                )
                    ? item.media[0] || ""
                    : item.media || "",

            pageCount:
                Number(
                    item.pageCount
                ) || 0
        };

        return item;
    }


    function normalizeVideo(
        raw,
        index = 0
    ) {

        const item =
            normalize(
                raw,
                index
            );

        if (!item) {
            return null;
        }

        item.type = "video";

        item.video = {

            url:
                Array.isArray(
                    item.media
                )
                    ? item.media[0] || ""
                    : item.media || "",

            length:
                item.videoLength ||
                ""
        };

        return item;
    }


    function normalizeSlideshow(
        raw,
        index = 0
    ) {

        const item =
            normalize(
                raw,
                index
            );

        if (!item) {
            return null;
        }

        item.type = "slideshow";


        if (
            Array.isArray(
                item.media
            )
        ) {

            item.slideshow = {

                source:
                    "images",

                slides:
                    item.media.slice()
            };

            item.slideCount =
                item.media.length;

        } else {

            item.slideshow = {

                source:
                    "pdf",

                url:
                    item.media || ""
            };

            item.slideCount =
                Number(
                    item.slideCount
                ) || 0;
        }


        return item;
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