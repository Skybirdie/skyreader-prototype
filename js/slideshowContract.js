"use strict";

/*
=========================================================
 SkyMedia Slide Show Contract — Unified C3.0

 The unified content contract accepts both:
   source: "images" + slides[]
   source: "pdf"    + url

 Image slide counts are corrected immediately from the
 actual slides array. PDF counts are corrected when PDF.js
 opens the document.
=========================================================
*/

window.SlideshowContract = (function () {

    function normalize(item, index = 0) {
        return ContentContract.normalizeSlideshow(item, index);
    }

function parse(payload) {
    const parsed = ContentContract.parse(payload);

    console.log(
        "[SlideshowContract] ContentContract.parse result:",
        parsed
    );

    console.log(
        "[SlideshowContract] PDF results before second normalization:",
        parsed.filter(item =>
            item &&
            item.type === "slideshow" &&
            item.source === "pdf"
        )
    );

    const normalized = parsed
        .filter(item => item && item.type === "slideshow")
        .map((item, index) => normalize(item, index));

    console.log(
        "[SlideshowContract] Results after second normalization:",
        normalized
    );

console.log(
    "[SlideshowContract] slideshow-005 after second normalization:",
    normalized.find(item => item && item.id === "slideshow-005")
);

    console.log(
        "[SlideshowContract] PDF results after second normalization:",
        normalized.filter(item =>
            item &&
            item.source === "pdf"
        )
    );

    return normalized
        .filter(item => {
                if (!item) return false;
                if (item.source === "pdf") return !!item.pdfUrl;
                return item.slides.length > 0;
            });
    }

    function normalizeSlide(slide) {
        return ContentContract.normalizeSlide(slide);
    }

    return {
        parse,
        normalize,
        normalizeSlide,
        unwrapMarkdownUrl: ContentContract.unwrapMarkdownUrl
    };

})();
