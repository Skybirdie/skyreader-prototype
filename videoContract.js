"use strict";

/*
=========================================================

 SkyReader Video Contract
 Normalizes incoming Video data.

=========================================================
*/

window.VideoContract = (function () {

    /*
    -------------------------------------------------------
     Helpers
    -------------------------------------------------------
    */

    function unwrapMarkdownUrl(value) {

        if (typeof value !== "string") {
            return value;
        }

        const trimmed = value.trim();

        /*
         Handles:

         [https://example.com/video.mp4](https://example.com/video.mp4)

         and returns:

         https://example.com/video.mp4
        */

        const match = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

        if (match) {
            return match[2];
        }

        return trimmed;
    }


    function cleanValue(value, fallback = "") {

        if (value === null || value === undefined) {
            return fallback;
        }

        if (typeof value === "string") {
            return value.trim();
        }

        return value;
    }


    function cleanUrl(value) {

        return unwrapMarkdownUrl(cleanValue(value, ""));
    }


    /*
    -------------------------------------------------------
     Parse incoming payload
    -------------------------------------------------------
    */

    function parse(payload) {

        if (!payload) {
            return [];
        }

        /*
        Already an array
        */

        if (Array.isArray(payload)) {
            return payload.map(normalize).filter(Boolean);
        }


        /*
        Object containing videos
        */

        if (typeof payload === "object") {

            /*
            Common wrapper possibilities
            */

            if (Array.isArray(payload.videos)) {
                return payload.videos
                    .map(normalize)
                    .filter(Boolean);
            }

            if (Array.isArray(payload.data)) {
                return payload.data
                    .map(normalize)
                    .filter(Boolean);
            }

            return [normalize(payload)].filter(Boolean);
        }


        /*
        String payload
        */

        if (typeof payload === "string") {

            const text = payload.trim();

            if (!text) {
                return [];
            }


            /*
            First try normal JSON.
            */

            try {

                const parsed = JSON.parse(text);

                if (Array.isArray(parsed)) {
                    return parsed
                        .map(normalize)
                        .filter(Boolean);
                }

                if (parsed && typeof parsed === "object") {
                    return [normalize(parsed)].filter(Boolean);
                }

            } catch (error) {

                /*
                Continue below.

                Glide may provide:

                {"id":"1",...},{"id":"2",...}

                without an outer array.
                */
            }


            /*
            Try comma-separated JSON objects.
            */

            const objects = splitJsonObjects(text);

            return objects
                .map(item => {

                    try {
                        return normalize(JSON.parse(item));
                    } catch (error) {
                        return null;
                    }

                })
                .filter(Boolean);
        }


        return [];
    }


    /*
    -------------------------------------------------------
     Split comma-separated JSON objects
    -------------------------------------------------------
    */

    function splitJsonObjects(text) {

        const results = [];

        let depth = 0;
        let inString = false;
        let escaped = false;
        let start = -1;

        for (let i = 0; i < text.length; i++) {

            const char = text[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === "\\") {
                escaped = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (inString) {
                continue;
            }

            if (char === "{") {

                if (depth === 0) {
                    start = i;
                }

                depth++;
            }

            else if (char === "}") {

                depth--;

                if (depth === 0 && start !== -1) {

                    results.push(
                        text.slice(start, i + 1)
                    );

                    start = -1;
                }
            }
        }

        return results;
    }


    /*
    -------------------------------------------------------
     Normalize Video Contract
    -------------------------------------------------------
    */

    function normalize(video) {

        if (!video || typeof video !== "object") {
            return null;
        }

        const normalized = {

            id:
                cleanValue(video.id) ||
                cleanValue(video.ID) ||
                cryptoSafeId(),

            title:
                cleanValue(video.title) ||
                cleanValue(video.Title) ||
                "Untitled Video",

            subtitle:
                cleanValue(video.subtitle) ||
                cleanValue(video.Subtitle),

            thumbnail:
                cleanUrl(
                    video.thumbnail ??
                    video.Thumbnail ??
                    video.image ??
                    video.Image
                ),

            video:
                cleanUrl(
                    video.video ??
                    video.Video ??
                    video.videoUrl ??
                    video.videoURL ??
                    video.url ??
                    video.URL
                ),

            author:
                cleanValue(video.author) ||
                cleanValue(video.Author) ||
                "unknown",

            category:
                cleanValue(video.category) ||
                cleanValue(video.Category) ||
                "unknown",

            date:
                cleanValue(video.date) ||
                cleanValue(video.Date),

            pageCount: null,

            /*
            These are optional.

            Normally the player discovers them directly
            from the video's metadata.
            */

            width:
                cleanValue(video.width) ||
                cleanValue(video.Width),

            height:
                cleanValue(video.height) ||
                cleanValue(video.Height)
        };


        /*
        A video without a playable source isn't useful
        to the Video Viewer.
        */

        if (!normalized.video) {
            return null;
        }

        return normalized;
    }


    function cryptoSafeId() {

        return (
            "video-" +
            Date.now() +
            "-" +
            Math.random()
                .toString(36)
                .slice(2, 8)
        );
    }


    /*
    -------------------------------------------------------
     Public API
    -------------------------------------------------------
    */

    return {

        parse,
        normalize,
        unwrapMarkdownUrl

    };

})();