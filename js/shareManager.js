"use strict";

window.ShareManager = (function () {
    const SECTION_PARAM = "section";
    const ID_PARAM = "id";

    function baseUrl() {
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = "";
        return url.toString();
    }

    function isEmbedded() {
        try {
            return window.top !== window.self;
        } catch (error) {
            /* Cross-origin frame access can throw; treat that as embedded. */
            return true;
        }
    }

    function cleanUrl(value) {
        if (value === undefined || value === null) return "";

        let text = String(value).trim();
        if (!text) return "";

        const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (match) {
            text = String(match[2] || match[1] || "").trim();
        }

        return text;
    }

    function getGlideUrl(item) {
        if (!item || typeof item !== "object") return "";

        return cleanUrl(
            item.glideUrl ||
            item.raw?.glideUrl ||
            item.shareUrl ||
            item.raw?.shareUrl
        );
    }

    function buildUrl(section, id) {
        const url = new URL(baseUrl());
        url.searchParams.set(SECTION_PARAM, section);
        url.searchParams.set(ID_PARAM, id);
        return url.toString();
    }

    function buildShareUrl(section, item) {
        if (!item || !item.id) return "";

        /*
         * When SkyMedia is embedded in Glide, prefer the per-item
         * Glide deep link supplied with the contract. That sends the
         * recipient to the actual Glide item rather than the host
         * SkyMedia page.
         *
         * Outside Glide, keep the existing SkyMedia host deep link.
         */
        /*
         * A populated Glide row URL is authoritative for sharing this
         * individual item. Do not gate it on iframe detection: browser
         * embedding state is not a reliable indicator of where the share
         * action should point, and the contract already tells us whether
         * a Glide destination exists.
         *
         * If no Glide URL was supplied, preserve the existing SkyMedia
         * deep-link behavior.
         */
        const glideUrl = getGlideUrl(item);
        if (glideUrl) return glideUrl;

        return buildUrl(section, item.id);
    }

    async function share(section, item) {
        if (!item || !item.id) return false;
        const url = buildShareUrl(section, item);
        const data = { title: item.title || "SkyReader", text: item.title || "", url };
        try {
            if (navigator.share && window.isSecureContext !== false) {
                await navigator.share(data);
                return true;
            }
        } catch (error) {
            if (error && error.name === "AbortError") return false;
        }
        try {
            await navigator.clipboard.writeText(url);
            announce("Link copied to clipboard.");
            return true;
        } catch (error) {
            window.prompt("Copy this link:", url);
            return false;
        }
    }

    function announce(message) {
        let el = document.getElementById("skyShareNotice");
        if (!el) {
            el = document.createElement("div");
            el.id = "skyShareNotice";
            el.setAttribute("role", "status");
            el.style.cssText = "position:fixed;left:50%;bottom:56px;transform:translateX(-50%);z-index:10000;padding:8px 14px;border-radius:8px;background:rgba(0,0,0,.8);color:#fff;font-size:13px;pointer-events:none;";
            document.body.appendChild(el);
        }
        el.textContent = message;
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.remove(), 1800);
    }

    function readTarget() {
        const params = new URLSearchParams(window.location.search);
        const section = params.get(SECTION_PARAM);
        const id = params.get(ID_PARAM);
        return section && id ? { section, id } : null;
    }

    async function openDeepLink() {
        const target = readTarget();
        if (!target) return false;
        if (!window.AppSwitcher) return false;

        if (target.section === "video" && window.VideoLibrary) {
            const item = VideoLibrary.getVideos?.().find(x => x.id === target.id);
            if (item) { AppSwitcher.show("video"); VideoViewer.openVideo(item); return true; }
        }
        if (target.section === "slideshow" && window.SlideshowLibrary) {
            const item = SlideshowLibrary.getSlideshows?.().find(x => x.id === target.id);
            if (item) { AppSwitcher.show("slideshow"); SlideshowViewer.open(item); return true; }
        }
        if (target.section === "reader" && window.Library) {
            const books = (window.SkyReader && Array.isArray(SkyReader.library) ? SkyReader.library : []) || [];
            const item = books.find(x => x.id === target.id);
            if (item && window.SRNavigation && typeof SRNavigation.openMagazine === "function") {
                AppSwitcher.show("reader");
                await SRNavigation.openMagazine(item);
                return true;
            }
        }
        return false;
    }

    return { buildUrl, buildShareUrl, share, readTarget, openDeepLink };
})();
