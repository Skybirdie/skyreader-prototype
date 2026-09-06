"use strict";

/*
=========================================================
 SkyMedia Glide Contract Adapter — C3.1

 Purpose
 -------
 Transport boundary between Glide and SkyMedia.

 Accepted sources
 ----------------
   window.SkyReaderGlideContract
   window.SkyReaderContract
   window.GLIDE_BOOK_CONTRACT
   window.SkyMediaContract

 URL parameters
 --------------
   ?contract=
   ?books=
   ?contractz=

 Contract shape
 --------------
   [
     {
       id: "...",
       type: "book",
       title: "...",
       subtitle: "...",
       thumbnail: "...",
       media: "...",
       audio: "",
       author: "",
       category: "...",
       date: "..."
     }
   ]

 The adapter is intentionally forgiving.

 It accepts:
   - a JSON array
   - a single JSON object
   - { content:[...] }
   - compact Glide object lists
   - Markdown-wrapped URLs
   - comma-separated Markdown URLs
   - comma-separated plain URLs (e.g. multiple images)
   - legacy book/video/slideshow structures
   - missing optional fields
   - malformed individual content items

 One bad item should NOT prevent the rest of the library
 from loading.

=========================================================
*/

window.GlideContract = (function () {

    const adapter = {};

    /* =====================================================
       BASIC HELPERS
    ===================================================== */

    function cleanString(value) {
        if (value === undefined || value === null) {
            return "";
        }

        return String(value).trim();
    }

    function firstValue() {
        for (let i = 0; i < arguments.length; i++) {
            const value = arguments[i];

            if (
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ""
            ) {
                return value;
            }
        }

        return "";
    }

    function readGlobal() {

        const candidates = [
            window.SkyReaderGlideContract,
            window.SkyReaderContract,
            window.GLIDE_BOOK_CONTRACT,
            window.SkyMediaContract
        ];

        for (const value of candidates) {

            if (
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                return value;
            }
        }

        return null;
    }

    function readQuery() {

        try {

            const params = new URLSearchParams(
                window.location.search
            );

            const value =
                params.get("contract") ||
                params.get("books");

            return value && value.trim()
                ? value
                : null;

        } catch (error) {

            console.warn(
                "[GlideContract] Unable to read contract query.",
                error
            );

            return null;
        }
    }

    function readCompressedQuery() {

        try {

            const params = new URLSearchParams(
                window.location.search
            );

            const value = params.get("contractz");

            return value && value.trim()
                ? value
                : null;

        } catch (error) {

            console.warn(
                "[GlideContract] Unable to read contractz query.",
                error
            );

            return null;
        }
    }


    /* =====================================================
       MARKDOWN / GLIDE URL CLEANING
    ===================================================== */

    function unwrapMarkdown(value) {

        let text = cleanString(value);

        if (!text) {
            return "";
        }

        /*
         Glide commonly produces:

           [URL](URL)

         Extract the actual destination.
        */

        const markdownMatch = text.match(
            /^\[([^\]]+)\]\(([^)]+)\)$/
        );

        if (markdownMatch) {

            return cleanString(
                markdownMatch[2] || markdownMatch[1]
            );
        }

        /*
         Occasionally a value may have surrounding quotes.
        */

        if (
            text.length >= 2 &&
            text.startsWith('"') &&
            text.endsWith('"')
        ) {
            text = text.slice(1, -1);
        }

        return text.trim();
    }


    function splitMediaValue(value) {

        /*
         If Glide eventually provides a real array,
         preserve it.
        */

        if (Array.isArray(value)) {

            return value
                .flatMap(item => splitMediaValue(item))
                .filter(Boolean);
        }

        const text = cleanString(value);

        if (!text) {
            return [];
        }

        /*
         A JSON array stored as text.
        */

        if (
            text.startsWith("[") &&
            text.endsWith("]")
        ) {

            try {

                const parsed = JSON.parse(text);

                if (Array.isArray(parsed)) {

                    return parsed
                        .flatMap(item => splitMediaValue(item))
                        .filter(Boolean);
                }

            } catch (error) {
                /*
                 Fall through to forgiving string parsing.
                */
            }
        }

        /*
         Split comma-separated Glide Markdown URLs.

         Example:

         [url1](url1), [url2](url2), [url3](url3)
        */

        const parts = text
            .split(/\s*,\s*(?=\[)/g)
            .map(part => unwrapMarkdown(part))
            .filter(Boolean);

        /*
         If the above did not split anything but the string
         still contains comma-separated plain URLs, support
         those too.
        */

        if (parts.length === 1 && text.includes(",")) {

            return text
                .split(",")
                .map(part => unwrapMarkdown(part))
                .filter(Boolean);
        }

        return parts;
    }


    function normalizeSingleMedia(value) {

        const values = splitMediaValue(value);

        return values.length
            ? values[0]
            : "";
    }


    /* =====================================================
       JSON PARSING
    ===================================================== */

    function parseObject(value) {

        if (Array.isArray(value)) {

            return {
                content: value
            };
        }

        if (
            value &&
            typeof value === "object"
        ) {

            /*
             Already a manifest-like object.
            */

            return value;
        }

        throw new Error(
            "Glide contract must be an object or array."
        );
    }


    function parseJsonText(text) {

        try {

            return parseObject(
                JSON.parse(text)
            );

        } catch (error) {

            return null;
        }
    }


    /*
     ---------------------------------------------------
     Safe "compact key" fixer

     Converts:

       {id:"1",type:"book"}

     into:

       {"id":"1","type":"book"}

     IMPORTANT — string-safety:

     A naive global regex here is dangerous. Content values
     can legitimately contain a comma followed by something
     that LOOKS like "identifier:" — most commonly a comma-
     separated list of image URLs, where one entry starts
     with "https:".

     Example of the failure this fix prevents:

       "media":"https://a/one.png, https://b/two.png"

     A naive regex sees the comma inside that string,
     followed by "https" and ":", and "fixes" it into:

       "media":"https://a/one.png, "https"://b/two.png"

     — which corrupts the URL and breaks JSON.parse.

     The fix: mask out every already-quoted string first, so
     the key-fixing regex can never see inside a string
     value, then restore the strings afterward untouched.
     ---------------------------------------------------
    */

    function quoteUnquotedKeys(source) {

        const strings = [];

        const masked = source.replace(
            /"(?:[^"\\]|\\.)*"/g,
            (match) => {
                strings.push(match);
                return "\u0000" + (strings.length - 1) + "\u0000";
            }
        );

        const fixed = masked.replace(
            /([{,])\s*([A-Za-z_$][\w$]*)\s*:/g,
            '$1"$2":'
        );

        return fixed.replace(
            /\u0000(\d+)\u0000/g,
            (match, index) => strings[Number(index)]
        );
    }


    /*
     ---------------------------------------------------
     Splits the (already unwrapped) inner content of an
     array into the substrings for each top-level {...}
     object, without being fooled by braces, commas, or
     quotes that live inside string values.
     ---------------------------------------------------
    */

    function splitTopLevelObjects(arrayInnerText) {

        const objects = [];

        let depth = 0;
        let inString = false;
        let escaped = false;
        let start = -1;

        for (let i = 0; i < arrayInnerText.length; i++) {

            const ch = arrayInnerText[i];

            if (inString) {

                if (escaped) {
                    escaped = false;
                } else if (ch === "\\") {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }

                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (ch === "{") {

                if (depth === 0) {
                    start = i;
                }

                depth++;

            } else if (ch === "}") {

                depth--;

                if (depth === 0 && start >= 0) {
                    objects.push(arrayInnerText.slice(start, i + 1));
                    start = -1;
                }
            }
        }

        return objects;
    }


    /*
     ---------------------------------------------------
     Parses an already-bracketed "[{...},{...}]" array
     text. If the whole array fails to parse (one bad
     item can otherwise take the entire batch down with
     it), falls back to parsing each top-level object
     independently and keeps whichever ones succeed.
     ---------------------------------------------------
    */

    function parseArrayResilient(normalized) {

        const whole = parseJsonText(normalized);

        if (whole) {
            return whole;
        }

        const inner = normalized
            .trim()
            .replace(/^\[/, "")
            .replace(/\]$/, "");

        const chunks = splitTopLevelObjects(inner);

        const recovered = [];

        chunks.forEach((chunk, index) => {

            try {

                recovered.push(
                    JSON.parse(chunk)
                );

            } catch (error) {

                console.warn(
                    "[GlideContract] Skipping unparseable content item",
                    index,
                    error
                );
            }

        });

        return recovered.length
            ? parseObject(recovered)
            : null;
    }


    function parseCompactText(text) {

        let normalized = cleanString(text);

        if (!normalized) {

            throw new Error(
                "Glide content contract is empty."
            );
        }

        /*
         Remove outer quoted-string wrapping sometimes
         introduced by Glide.
        */

        if (
            normalized.length >= 2 &&
            normalized.startsWith('"') &&
            normalized.endsWith('"')
        ) {

            normalized =
                normalized.slice(1, -1);

            normalized =
                normalized.replace(/""/g, '"');
        }

        normalized = normalized.trim();

        /*
         Convert:

           {id:"1",type:"book"}

         into:

           {"id":"1","type":"book"}

         — safely, without reaching inside string values
         (see quoteUnquotedKeys above).
        */

        normalized = quoteUnquotedKeys(normalized);

        /*
         Convert a comma-separated list of objects
         into an array.

           {...},{...}

         */

        if (
            !normalized.startsWith("[") &&
            normalized.startsWith("{") &&
            normalized.endsWith("}")
        ) {

            /*
             Try it as one object first.
            */

            const one = parseJsonText(normalized);

            if (one) {
                return one;
            }

            normalized =
                "[" + normalized + "]";
        }

        if (!normalized.startsWith("[")) {
            normalized = "[" + normalized + "]";
        }

        const parsed = parseArrayResilient(normalized);

        if (!parsed) {

            throw new Error(
                "Unable to parse Glide content contract."
            );
        }

        return parsed;
    }


    function parse(value) {

        if (
            value &&
            typeof value === "object"
        ) {

            return parseObject(value);
        }

        if (typeof value !== "string") {

            throw new Error(
                "Glide contract must be text, an array, or a manifest object."
            );
        }

        const text = value.trim();

        if (!text) {

            throw new Error(
                "Glide contract is empty."
            );
        }

        /*
         First attempt normal JSON.
        */

        const json = parseJsonText(text);

        if (json) {
            return json;
        }

        /*
         Then attempt Glide compact syntax.
        */

        return parseCompactText(text);
    }


    /* =====================================================
       CONTENT EXTRACTION
    ===================================================== */

    function extractContent(raw) {

        if (!raw) {
            return [];
        }

        if (Array.isArray(raw)) {
            return raw;
        }

        if (
            raw.content &&
            Array.isArray(raw.content)
        ) {
            return raw.content;
        }

        /*
         Some older payloads may use books.
        */

        if (
            raw.books &&
            Array.isArray(raw.books)
        ) {
            return raw.books;
        }

        /*
         Allow a manifest containing separate collections.
        */

        const result = [];

        if (Array.isArray(raw.books)) {
            result.push(...raw.books);
        }

        if (Array.isArray(raw.videos)) {
            result.push(...raw.videos);
        }

        if (Array.isArray(raw.slideshows)) {
            result.push(...raw.slideshows);
        }

        return result;
    }


    /* =====================================================
       SAFE DATE
    ===================================================== */

    function normalizeDate(value) {

        const text = cleanString(value);

        if (!text) {
            return "";
        }

        /*
         Keep the authoritative Glide value intact.

         Expected form:

           YYYYMMDDHHMM

         But do not reject other reasonable date formats.
        */

        return text;
    }


    /* =====================================================
       SAFE TYPE
    ===================================================== */

    function normalizeType(raw) {

        let type = cleanString(
            firstValue(
                raw && raw.type,
                ""
            )
        ).toLowerCase();

        /*
         Standard semantic types.
        */

        if (
            type === "book" ||
            type === "books" ||
            type === "pdf" ||
            type === "reader"
        ) {
            return "book";
        }

        if (
            type === "video" ||
            type === "videos"
        ) {
            return "video";
        }

        if (
            type === "slideshow" ||
            type === "slideshows" ||
            type === "slide-show" ||
            type === "slides"
        ) {
            return "slideshow";
        }

        /*
         Legacy structures can identify the type even
         when type is missing.
        */

        if (raw && raw.video) {
            return "video";
        }

        if (raw && raw.slideshow) {
            return "slideshow";
        }

        if (raw && raw.book) {
            return "book";
        }

        return type;
    }


    /* =====================================================
       SAFE MEDIA EXTRACTION
    ===================================================== */

    function extractMedia(raw, type) {

        if (!raw || typeof raw !== "object") {
            return type === "slideshow" ? [] : "";
        }

        /*
         ---------------------------------------------------
         NEW CONTRACT
         ---------------------------------------------------
        */

        if (
            raw.media !== undefined &&
            raw.media !== null
        ) {

            const media = splitMediaValue(raw.media);

            if (type === "slideshow") {

                /*
                 One PDF is represented internally as one
                 string.

                 Multiple images become an array.
                */

                if (media.length === 1) {
                    return media[0];
                }

                return media;
            }

            return media.length
                ? media[0]
                : "";
        }


        /*
         ---------------------------------------------------
         LEGACY BOOK
         ---------------------------------------------------
        */

        if (raw.book) {

            if (
                typeof raw.book === "string"
            ) {
                return normalizeSingleMedia(
                    raw.book
                );
            }

            if (
                raw.book.url
            ) {
                return normalizeSingleMedia(
                    raw.book.url
                );
            }
        }


        /*
         ---------------------------------------------------
         LEGACY VIDEO
         ---------------------------------------------------
        */

        if (raw.video) {

            if (
                typeof raw.video === "string"
            ) {
                return normalizeSingleMedia(
                    raw.video
                );
            }

            if (
                raw.video.url
            ) {
                return normalizeSingleMedia(
                    raw.video.url
                );
            }
        }


        /*
         ---------------------------------------------------
         LEGACY SLIDESHOW
         ---------------------------------------------------
        */

        if (raw.slideshow) {

            if (
                typeof raw.slideshow === "string"
            ) {
                return normalizeSingleMedia(
                    raw.slideshow
                );
            }

            if (
                raw.slideshow.url
            ) {

                return normalizeSingleMedia(
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
                        splitMediaValue(item)
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

        /*
         New format:

           audio:"URL"
        */

        if (
            typeof raw.audio === "string"
        ) {

            return normalizeSingleMedia(
                raw.audio
            );
        }

        /*
         Forgiving support for:

           audio:{url:"..."}
        */

        if (
            raw.audio &&
            typeof raw.audio === "object"
        ) {

            return normalizeSingleMedia(
                raw.audio.url
            );
        }

        return "";
    }


    /* =====================================================
       UNIVERSAL CONTENT NORMALIZER
    ===================================================== */

    function normalize(raw, index) {

        /*
         Never allow one malformed object to crash the
         entire contract.

         Return null for truly unusable entries.
        */

        if (
            !raw ||
            typeof raw !== "object"
        ) {

            console.warn(
                "[GlideContract] Ignoring invalid content item:",
                index,
                raw
            );

            return null;
        }

        try {

            const type =
                normalizeType(raw);

            const media =
                extractMedia(raw, type);

            const normalized = {

                id: cleanString(
                    firstValue(
                        raw.id,
                        `content-${index + 1}`
                    )
                ),

                type: type,

                title: cleanString(
                    raw.title
                ),

                subtitle: cleanString(
                    raw.subtitle
                ),

                thumbnail: normalizeSingleMedia(
                    raw.thumbnail
                ),

                media: media,

                audio: extractAudio(raw),

                author: cleanString(
                    raw.author
                ),

                category: cleanString(
                    raw.category
                ),

                date: normalizeDate(
                    raw.date
                )
            };


            /*
             ------------------------------------------------
             LEGACY COMPATIBILITY METADATA
             ------------------------------------------------

             Keep useful old fields available internally
             without requiring them in the new contract.
            */

            if (
                raw.dateAdd !== undefined &&
                !normalized.date
            ) {

                normalized.date =
                    normalizeDate(
                        raw.dateAdd
                    );
            }


            /*
             Legacy video length remains available if
             supplied, but is NOT required by the new
             contract.
            */

            if (
                raw.video &&
                typeof raw.video === "object" &&
                raw.video.length
            ) {

                normalized.videoLength =
                    cleanString(
                        raw.video.length
                    );
            }

            if (
                raw.videoLength
            ) {

                normalized.videoLength =
                    cleanString(
                        raw.videoLength
                    );
            }


            /*
             Legacy book page count remains available
             if supplied. The new contract does not need it.
            */

            if (
                raw.book &&
                typeof raw.book === "object" &&
                raw.book.pageCount !== undefined
            ) {

                normalized.pageCount =
                    Number(raw.book.pageCount) || 0;
            }

            if (
                raw.pageCount !== undefined
            ) {

                normalized.pageCount =
                    Number(raw.pageCount) || 0;
            }


            /*
             Legacy slideshow slide count remains available
             if supplied. The new contract does not need it.
            */

            if (
                raw.slideCount !== undefined
            ) {

                normalized.slideCount =
                    Number(raw.slideCount) || 0;
            }

            if (
                raw.slideCount === undefined &&
                Array.isArray(normalized.media)
            ) {

                normalized.slideCount =
                    normalized.media.length;
            }


            /*
             Do not discard an item merely because optional
             fields are empty.

             The minimum useful identity is an ID and a type.
            */

            if (!normalized.id) {

                normalized.id =
                    `content-${index + 1}`;
            }


            /*
             If type is missing but the media itself clearly
             indicates the type, make a best effort.
            */

            if (!normalized.type) {

                const candidateMedia =
                    Array.isArray(normalized.media)
                        ? normalized.media[0]
                        : normalized.media;

                const mediaText =
                    cleanString(
                        candidateMedia
                    ).toLowerCase();

                if (
                    mediaText.includes("youtube.com") ||
                    mediaText.includes("youtu.be") ||
                    /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(
                        mediaText
                    )
                ) {

                    normalized.type = "video";

                } else if (
                    Array.isArray(normalized.media)
                ) {

                    normalized.type = "slideshow";

                } else if (
                    /\.pdf(\?|#|$)/i.test(
                        mediaText
                    )
                ) {

                    normalized.type = "book";
                }
            }




const raw = parseCompressed(compressed);

console.log(
    "[GlideContract] contractz decoded:",
    raw
);

const normalized =
    normalizeManifest(raw);

console.log(
    "[GlideContract] contractz normalized:",
    normalized
);

return normalized;




            return normalized;

        } catch (error) {

            console.warn(
                "[GlideContract] Failed to normalize content item",
                index,
                error,
                raw
            );

            return null;
        }
    }


    /* =====================================================
       SECTION-SPECIFIC NORMALIZERS
       ===================================================== */

    function normalizeBook(raw, index) {

        const item =
            normalize(raw, index);

        if (!item) {
            return null;
        }

        /*
         Preserve the semantic book type.
        */

        item.type = "book";

        /*
         Reader historically expects a book object with
         book.url.

         Keep that compatibility layer while the
         authoritative contract remains simply:

           media:"file.pdf"
        */

        const url =
            Array.isArray(item.media)
                ? item.media[0] || ""
                : item.media || "";

        item.book = {
            url: url,
            pageCount:
                Number(item.pageCount) || 0
        };

        return item;
    }


    function normalizeVideo(raw, index) {

        const item =
            normalize(raw, index);

        if (!item) {
            return null;
        }

        item.type = "video";

        const url =
            Array.isArray(item.media)
                ? item.media[0] || ""
                : item.media || "";

        /*
         Preserve the old viewer's expected structure.
        */

        item.video = {
            url: url,
            length:
                item.videoLength || ""
        };

        return item;
    }


    function normalizeSlideshow(raw, index) {

        const item =
            normalize(raw, index);

        if (!item) {
            return null;
        }

        item.type = "slideshow";

        /*
         New slideshow representation:

           media:"file.pdf"

         or:

           media:["one.jpg","two.jpg","three.jpg"]

         Internally the slideshow viewer can use this
         directly.
        */

        const media = item.media;

        /*
         Preserve a compatibility slideshow object for
         code that still expects slideshow.source/slides.
        */

        if (Array.isArray(media)) {

            item.slideshow = {
                source: "images",
                slides: media.slice()
            };

            item.slideCount =
                media.length;

        } else {

            item.slideshow = {
                source: "pdf",
                url: media || ""
            };

            item.slideCount =
                Number(item.slideCount) || 0;
        }

        return item;
    }


    /* =====================================================
       MANIFEST NORMALIZATION
    ===================================================== */

    function normalizeManifest(rawManifest) {

        const content =
            extractContent(rawManifest);

        const normalized = [];

        for (
            let i = 0;
            i < content.length;
            i++
        ) {

            const item =
                normalize(content[i], i);

            /*
             Skip only the individual item that could not
             be normalized.
            */

            if (item) {
                normalized.push(item);
            }
        }

        return {
            content: normalized
        };
    }


    /* =====================================================
       AVAILABILITY
    ===================================================== */

    adapter.available = function () {

        return (
            readGlobal() !== null ||
            readCompressedQuery() !== null ||
            readQuery() !== null
        );
    };


    /* =====================================================
       LOAD
    ===================================================== */

    adapter.load = async function () {

        /*
         --------------------------------------------------
         1. Direct global contract
         --------------------------------------------------
        */

        const global =
            readGlobal();

        if (global !== null) {

            try {

                return normalizeManifest(parse(global));

            } catch (error) {

                console.error(
                    "[GlideContract] Global contract failed.",
                    error
                );

                /*
                 Do NOT immediately fail.

                 Continue and see whether a query parameter
                 provides a usable contract.
                */
            }
        }


        /*
         --------------------------------------------------
         2. Compressed contract
         --------------------------------------------------
        */

        const compressed =
            readCompressedQuery();

        if (compressed !== null) {

            try {

                return normalizeManifest(
    parseCompressed(compressed)
);

            } catch (error) {

                console.error(
                    "[GlideContract] contractz failed.",
                    error
                );

                /*
                 Continue to normal query contract.
                */
            }
        }


        /*
         --------------------------------------------------
         3. Normal query contract
         --------------------------------------------------
        */

        const query =
            readQuery();

        if (query !== null) {

            try {

                return normalizeManifest(parse(query));

            } catch (error) {

                console.error(
                    "[GlideContract] Query contract failed.",
                    error
                );
            }
        }


        /*
         Nothing usable was found.

         Return null rather than throwing.
        */

        return null;
    };


    /* =====================================================
       NORMALIZATION API
    ===================================================== */

    adapter.normalizeManifest =
        function (rawManifest) {

            return normalizeManifest(
                rawManifest
            );
        };


    adapter.normalizeContent =
        function (raw, index) {

            return normalize(
                raw,
                index || 0
            );
        };


    adapter.normalizeBook =
        function (raw, index) {

            return normalizeBook(
                raw,
                index || 0
            );
        };


    adapter.normalizeVideo =
        function (raw, index) {

            return normalizeVideo(
                raw,
                index || 0
            );
        };


    adapter.normalizeSlideshow =
        function (raw, index) {

            return normalizeSlideshow(
                raw,
                index || 0
            );
        };


    /* =====================================================
       C2.2 / SR2 COMPRESSED TRANSPORT
    ===================================================== */

    const CODEC_VERSION = 2;


    function base64UrlEncode(bytes) {

        let binary = "";

        const chunk = 0x8000;

        for (
            let i = 0;
            i < bytes.length;
            i += chunk
        ) {

            binary += String.fromCharCode(
                ...bytes.subarray(
                    i,
                    Math.min(
                        i + chunk,
                        bytes.length
                    )
                )
            );
        }

        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }


    function base64UrlDecode(text) {

        const normalized =
            cleanString(text)
                .replace(/-/g, "+")
                .replace(/_/g, "/");

        const padded =
            normalized +
            "=".repeat(
                (4 - normalized.length % 4) % 4
            );

        const binary =
            atob(padded);

        const bytes =
            new Uint8Array(
                binary.length
            );

        for (
            let i = 0;
            i < binary.length;
            i++
        ) {

            bytes[i] =
                binary.charCodeAt(i);
        }

        return bytes;
    }


    function compressBytes(input) {

        const out = [
            CODEC_VERSION
        ];

        const windowSize = 4095;
        const maxLen = 18;
        const minLen = 3;

        const candidates =
            new Map();

        let pos = 0;

        let flags = 0;
        let flagBit = 0;
        let flagIndex = -1;

        let tokenBytes = [];


        function flush() {

            if (flagIndex < 0) {
                return;
            }

            out[flagIndex] =
                flags;

            for (
                const b of tokenBytes
            ) {

                out.push(b);
            }

            flags = 0;
            flagBit = 0;
            flagIndex = -1;
            tokenBytes = [];
        }


        function keyAt(i) {

            return (
                input[i] + "," +
                input[i + 1] + "," +
                input[i + 2]
            );
        }


        function addCandidate(i) {

            if (
                i + 2 >= input.length
            ) {
                return;
            }

            const key =
                keyAt(i);

            let list =
                candidates.get(key);

            if (!list) {

                list = [];

                candidates.set(
                    key,
                    list
                );
            }

            list.push(i);

            if (list.length > 24) {
                list.shift();
            }
        }


        while (
            pos < input.length
        ) {

            if (flagIndex < 0) {

                flagIndex =
                    out.length;

                out.push(0);
            }


            let bestLen = 0;
            let bestOffset = 0;


            if (
                pos + minLen <=
                input.length
            ) {

                const list =
                    candidates.get(
                        keyAt(pos)
                    );

                if (list) {

                    for (
                        let n =
                            list.length - 1;
                        n >= 0;
                        n--
                    ) {

                        const start =
                            list[n];

                        const offset =
                            pos - start;

                        if (
                            offset <= 0 ||
                            offset > windowSize
                        ) {
                            continue;
                        }

                        let len = 3;

                        while (
                            len < maxLen &&
                            pos + len <
                                input.length &&
                            input[
                                start + len
                            ] ===
                            input[
                                pos + len
                            ]
                        ) {

                            len++;
                        }

                        if (
                            len > bestLen
                        ) {

                            bestLen = len;
                            bestOffset =
                                offset;

                            if (
                                len === maxLen
                            ) {
                                break;
                            }
                        }
                    }
                }
            }


            if (
                bestLen >= minLen
            ) {

                flags |=
                    1 << flagBit;

                const packed =
                    ((bestOffset - 1) << 4) |
                    (bestLen - maxLen + 15);

                tokenBytes.push(
                    (packed >>> 8) & 255,
                    packed & 255
                );

                for (
                    let i = 0;
                    i < bestLen;
                    i++
                ) {

                    addCandidate(
                        pos + i
                    );
                }

                pos += bestLen;

            } else {

                tokenBytes.push(
                    input[pos]
                );

                addCandidate(pos);

                pos++;
            }


            flagBit++;

            if (
                flagBit === 8
            ) {
                flush();
            }
        }


        flush();

        return new Uint8Array(
            out
        );
    }


    function decompressBytes(input) {

        if (
            !input.length ||
            input[0] !== CODEC_VERSION
        ) {

            throw new Error(
                "Unsupported contractz version."
            );
        }

        const out = [];

        let p = 1;


        while (
            p < input.length
        ) {

            const flags =
                input[p++];

            for (
                let bit = 0;
                bit < 8 &&
                p < input.length;
                bit++
            ) {

                if (
                    flags &
                    (1 << bit)
                ) {

                    if (
                        p + 1 >=
                        input.length
                    ) {

                        throw new Error(
                            "Invalid compressed Glide contract."
                        );
                    }

                    const packed =
                        (input[p++] << 8) |
                        input[p++];

                    const offset =
                        (packed >>> 4) + 1;

                    const len =
                        (packed & 15) + 3;

                    const start =
                        out.length -
                        offset;

                    if (
                        start < 0
                    ) {

                        throw new Error(
                            "Invalid compressed Glide contract offset."
                        );
                    }

                    for (
                        let i = 0;
                        i < len;
                        i++
                    ) {

                        out.push(
                            out[start + i]
                        );
                    }

                } else {

                    out.push(
                        input[p++]
                    );
                }
            }
        }

        return new Uint8Array(
            out
        );
    }


    function encodeCompressed(text) {

        const bytes =
            new TextEncoder()
                .encode(text);

        return base64UrlEncode(
            compressBytes(bytes)
        );
    }


    function decodeCompressed(payload) {

        const bytes =
            base64UrlDecode(
                payload
            );

        return new TextDecoder()
            .decode(
                decompressBytes(bytes)
            );
    }


    function parseCompressed(text) {

        const payload =
            cleanString(text)
                .replace(
                    /^sr2\./,
                    ""
                );

        const json =
            decodeCompressed(
                payload
            );

        /*
         Try normal JSON first.
        */

        const parsed =
            parseJsonText(json);

        if (parsed) {
            return parsed;
        }

        /*
         Then use the forgiving Glide parser.
        */

        return parseCompactText(
            json
        );
    }


    /* =====================================================
       PUBLIC CODEC API
    ===================================================== */

    adapter.codec = {

        encode: function (value) {

            const text =
                typeof value === "string"
                    ? value
                    : JSON.stringify(value);

            return (
                "sr2." +
                encodeCompressed(text)
            );
        },


        decode: function (payload) {

            const text =
                cleanString(payload)
                    .replace(
                        /^sr2\./,
                        ""
                    );

            return decodeCompressed(
                text
            );
        }
    };


    /* =====================================================
       DEBUG / DIAGNOSTIC API
    ===================================================== */

    adapter.debug = {

        parse: function (value) {

            return parse(value);
        },

        extractContent: function (value) {

            return extractContent(value);
        },

        normalize: function (
            value,
            index
        ) {

            return normalize(
                value,
                index || 0
            );
        },

        normalizeManifest:
            function (value) {

                return normalizeManifest(
                    value
                );
            }
    };


    return adapter;

})();