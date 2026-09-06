"use strict";

/*

SkyReader Video Viewer

Video player + responsive landing

=========================================================
*/

window.VideoViewer = (function () {

let viewerElement = null;
let videoElement = null;
let iframeElement = null;
let activePlayerType = "video";
let titleElement = null;

let landingElement = null;

let statusMessageElement = null;
let statusTitleElement = null;
let statusIndicatorElement = null;

let currentVideo = null;
let lastSelectedVideo = null;

let resizeObserverBound = false;


/*
-------------------------------------------------------
 Initialize
-------------------------------------------------------
*/

function init(options = {}) {

    viewerElement =
        options.viewerElement ||
        document.getElementById("videoViewer");

    videoElement =
        options.videoElement ||
        document.getElementById("videoPlayer");

    titleElement =
        options.titleElement ||
        document.getElementById("videoViewerTitle");

    landingElement =
        options.landingElement ||
        document.getElementById("videoLanding");

    statusMessageElement =
        options.statusMessageElement ||
        document.getElementById("videoStatusMessage");

    statusTitleElement =
        options.statusTitleElement ||
        document.getElementById("videoStatusTitle");

    statusIndicatorElement =
        options.statusIndicatorElement ||
        document.getElementById("videoIndicator");


    if (!videoElement) {
        return false;
    }

    const shareButton = document.getElementById("videoViewerShare");
    if (shareButton && !shareButton.dataset.bound) {
        shareButton.dataset.bound = "true";
        shareButton.addEventListener("click", () => { if (currentVideo && window.ShareManager) ShareManager.share("video", currentVideo); });
    }

    const closeButton = document.getElementById("videoViewerClose");
    if (closeButton && !closeButton.dataset.bound) {
        closeButton.dataset.bound = "true";
        closeButton.addEventListener("click", closeVideo);
    }

    if (!document.documentElement.dataset.videoEscapeBound) {
        document.documentElement.dataset.videoEscapeBound = "true";
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            if (currentVideo) {
                event.preventDefault();
                event.stopPropagation();
                closeVideo();
            }
        }, true);
    }


    /*
    ---------------------------------------------------
     Video metadata
    ---------------------------------------------------
    */

    videoElement.addEventListener(
        "loadedmetadata",
        handleMetadata
    );

    // Safety net: a few browsers can report loadedmetadata
    // before videoWidth/videoHeight are populated. Re-check
    // once more data has actually arrived.
    videoElement.addEventListener(
        "loadeddata",
        handleMetadata
    );


    /*
    ---------------------------------------------------
     Status bar: playback state
    ---------------------------------------------------
    */

    videoElement.addEventListener(
        "play",
        () => setStatusMessage("Playing")
    );

    videoElement.addEventListener(
        "pause",
        () => setStatusMessage("Paused")
    );

    videoElement.addEventListener(
        "ended",
        () => setStatusMessage("Finished")
    );

    videoElement.addEventListener(
        "waiting",
        () => setStatusMessage("Buffering…")
    );


    /*
    ---------------------------------------------------
     Responsive layout
    ---------------------------------------------------
    */

    window.addEventListener(
    "resize",
    () => {

        refreshVideoLayout();



    }
);

    /*
    ---------------------------------------------------
     The viewer's own box can change size without a
     window resize (library drawer opening/closing,
     focus mode, orientation changes). Watch it directly
     so the video always re-fits.
    ---------------------------------------------------
    */

    if (
        !resizeObserverBound &&
        typeof ResizeObserver !== "undefined" &&
        viewerElement
    ) {

        resizeObserverBound = true;

        const observer =
            new ResizeObserver(() => {
                refreshVideoLayout();
            });

        observer.observe(viewerElement);
    }

    if (!document.documentElement.dataset.videoFullscreenBound) {
        document.documentElement.dataset.videoFullscreenBound = "true";
        document.addEventListener(
            "fullscreenchange",
            () => refreshVideoLayout()
        );
    }


    /*
    ---------------------------------------------------
     Initial state
    ---------------------------------------------------
    */

    refreshVideoLayout();

    renderLanding();


    return true;
}





/*
=======================================================
 LANDING
=======================================================
*/


function renderLanding() {

    if (!landingElement) {
        return;
    }


    /*
    ---------------------------------------------------
     Get the authoritative video collection.
     ---------------------------------------------------
    */

    let videos = [];


    if (
        window.VideoLibrary &&
        typeof VideoLibrary.getVideos === "function"
    ) {

        videos =
            VideoLibrary.getVideos();

    }


    /*
    ---------------------------------------------------
     Clear existing cards.
    ---------------------------------------------------
    */

    const continueContainer =
        landingElement.querySelector(
            "#videoLandingContinue"
        );

    const libraryContainer =
        landingElement.querySelector(
            "#videoLandingLibrary"
        );

    const continueSection =
    landingElement.querySelector(
        ".video-landing-continue-section"
    );


    if (continueContainer) {
        continueContainer.innerHTML = "";
    }


    if (continueSection) {
    continueSection.classList.add("is-empty");
}

    if (libraryContainer) {
        libraryContainer.innerHTML = "";
    }


    /*
    ---------------------------------------------------
     Nothing to render yet.
    ---------------------------------------------------
    */

    if (!videos.length) {
        return;
    }

    if (!lastSelectedVideo) {
        try {
            const recent = JSON.parse(localStorage.getItem("skyvideo-recent") || "[]");
            if (Array.isArray(recent) && recent.length) {
                lastSelectedVideo = videos.find(video => video.id === recent[0]) || null;
            }
        } catch (e) {}
    }


    /*
    ---------------------------------------------------
     Library

     All videos are displayed as standard circles in
     a single horizontal scrolling row.
    ---------------------------------------------------
    */

    if (libraryContainer) {

        videos.forEach(
            video => {

                libraryContainer.appendChild(
                    createLandingCircle(
                        video
                    )
                );

            }
        );

    }


    /*
    ---------------------------------------------------
     View Again

     For now use the most recently selected video,
     when one exists.
    ---------------------------------------------------
    */

    if (
    continueContainer &&
    continueSection &&
    lastSelectedVideo
) {

    continueContainer.appendChild(
        createWatchAgainCard(
            lastSelectedVideo
        )
    );

    continueSection.classList.remove(
        "is-empty"
    );

}

}


/*
-------------------------------------------------------
 Watch Again card

 Mirrors SkyReader's Read Again card exactly: thumbnail
 on the left, title and a "last watched" line stacked to
 the right — no text overlaid on the thumbnail itself.
-------------------------------------------------------
*/

function createWatchAgainCard(video) {

    const card =
        document.createElement("button");

    card.type =
        "button";

    card.className =
        "video-landing-recent-card";


    const thumbnail =
        document.createElement("img");

    thumbnail.className =
        "video-landing-recent-thumbnail";

    thumbnail.loading =
        "lazy";

    thumbnail.src =
        video.thumbnail || "";

    thumbnail.alt =
        video.title || "";


    const info =
        document.createElement("div");

    info.className =
        "video-landing-recent-info";

    const title =
        document.createElement("div");

    title.className =
        "video-landing-recent-title";

    title.textContent =
        video.title || "";

    const subtitle =
        document.createElement("div");

    subtitle.className =
        "video-landing-recent-subtitle";

    subtitle.textContent =
        "Last watched";

    info.appendChild(title);
    info.appendChild(subtitle);

    card.appendChild(thumbnail);
    card.appendChild(info);

    card.addEventListener(
        "click",
        () => {

            openVideo(video);

        }
    );

    return card;
}


function createLandingFeatured(video) {

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "video-landing-featured";


    /*
    -------------------------------------------------------
     Featured watch card

     The landing hero is independent from the featured
     video. Its logo and title live in the landing markup.
    -------------------------------------------------------
    */

    const button =
        document.createElement("button");

    button.type =
        "button";

    button.className =
        "video-landing-watch";


    /*
    Thumbnail
    */

    const thumbnail =
        document.createElement("div");

    thumbnail.className =
        "video-landing-watch-thumbnail";


    if (video.thumbnail) {

        const image =
            document.createElement("img");

        image.src =
            video.thumbnail;

        image.alt =
            video.title || "";

        image.loading =
            "lazy";

        thumbnail.appendChild(
            image
        );

    }


    /*
    -------------------------------------------------------
     Watch label
    -------------------------------------------------------
    */

    const watchLabel =
        document.createElement("span");

    watchLabel.className =
        "video-landing-watch-label";

    watchLabel.textContent =
        "Watch";


    button.appendChild(
        thumbnail
    );

    button.appendChild(
        watchLabel
    );


    /*
    -------------------------------------------------------
     Open featured video
    -------------------------------------------------------
    */

    button.addEventListener(
        "click",
        () => {

            openVideo(video);

        }
    );


    wrapper.appendChild(
        button
    );


    return wrapper;
}

/*
-------------------------------------------------------
 Landing Circle
-------------------------------------------------------
*/

function createLandingCircle(video) {

    const button =
        document.createElement("button");

    button.type =
        "button";

    button.className =
        "video-landing-circle-card";


    const circle =
        document.createElement("div");

    circle.className =
        "video-landing-circle";


    /*
    ---------------------------------------------------
     Thumbnail
    ---------------------------------------------------
    */

    if (video.thumbnail) {

        const image =
            document.createElement("img");

        image.src =
            video.thumbnail;

        image.alt =
            video.title || "";

        image.loading =
            "lazy";

        circle.appendChild(image);

    }


    button.appendChild(circle);


    /*
    ---------------------------------------------------
     Caption

     Sits below the circle rather than overlaid on top
     of the thumbnail, matching the Reader section's
     shelf-card convention.
    ---------------------------------------------------
    */

    const title =
        document.createElement("span");

    title.className =
        "video-landing-circle-title";

    title.textContent =
        video.title || "";

    button.appendChild(title);

    const favorite = document.createElement("span");
    favorite.className = "video-landing-favorite";
    favorite.setAttribute("role", "button");
    favorite.setAttribute("tabindex", "0");
    favorite.setAttribute("aria-label", "Favorite " + (video.title || "video"));
    function refreshFavorite(){
        const active = !!(window.VideoFavorites && VideoFavorites.has(video.id));
        favorite.classList.toggle("is-favorite", active);
        favorite.textContent = active ? "♥" : "♡";
        favorite.setAttribute("aria-pressed", String(active));
    }
    function toggleFavorite(event){
        event.preventDefault();
        event.stopPropagation();
        if(window.VideoFavorites) VideoFavorites.toggle(video.id);
        refreshFavorite();
        if(window.VideoLibrary && typeof VideoLibrary.render === "function") VideoLibrary.render();
        renderLanding();
    }
    favorite.addEventListener("click", toggleFavorite);
    favorite.addEventListener("keydown", event => {
        if(event.key === "Enter" || event.key === " ") toggleFavorite(event);
    });
    button.appendChild(favorite);
    refreshFavorite();


    /*
    ---------------------------------------------------
     Selection
    ---------------------------------------------------
    */

    button.addEventListener(
        "click",
        () => {

            openVideo(video);

        }
    );


    return button;
}


/*
-------------------------------------------------------
 Open video
-------------------------------------------------------
*/

/*
-------------------------------------------------------
 Status bar

 Mirrors SkyReader's #statusBar: a short status
 message, the current title, and an "N of total"
 indicator against the full (unfiltered) library.
-------------------------------------------------------
*/

function setStatusMessage(message) {

    if (statusMessageElement) {

        statusMessageElement.textContent =
            message || "";

    }

}


function updateStatusBar(video) {

    if (statusTitleElement) {

        statusTitleElement.textContent =
            video ? (video.title || "") : "";

    }

    if (statusIndicatorElement) {

        if (
            video &&
            window.VideoLibrary &&
            typeof VideoLibrary.getIndex === "function"
        ) {

            const index =
                VideoLibrary.getIndex(video.id);

            const count =
                VideoLibrary.getCount();

            statusIndicatorElement.textContent =
                (index > -1 && count > 0)
                    ? (index + 1) + " / " + count
                    : "";

        }
        else {

            statusIndicatorElement.textContent = "";

        }

    }

}



function ensureIframePlayer() {

    if (iframeElement) {
        return iframeElement;
    }

    iframeElement = document.createElement("iframe");

    iframeElement.id = "videoIframePlayer";
    iframeElement.className = "video-iframe-player";

    iframeElement.setAttribute(
        "allow",
        "autoplay; fullscreen; picture-in-picture"
    );

iframeElement.setAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin"
);


    iframeElement.setAttribute(
        "allowfullscreen",
        ""
    );

    iframeElement.setAttribute(
        "frameborder",
        "0"
    );

    iframeElement.style.display = "none";

    if (videoElement && videoElement.parentNode) {
        videoElement.parentNode.insertBefore(
            iframeElement,
            videoElement.nextSibling
        );
    }

    return iframeElement;
}

function clearActivePlayer() {

    if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute("src");
        videoElement.load();
        videoElement.style.display = "none";
    }

    if (iframeElement) {
        iframeElement.src = "about:blank";
        iframeElement.style.display = "none";
    }
}

function loadVideoPlayer(video) {

    if (!video) return;

const isYouTube =
    window.ContentContract &&
    typeof ContentContract.isYouTubeUrl === "function" &&
    ContentContract.isYouTubeUrl(video.video);

    clearActivePlayer();

if (isYouTube) {

    activePlayerType = "iframe";

    const iframe = ensureIframePlayer();

    iframe.src =
        window.ContentContract &&
        typeof ContentContract.toYouTubeEmbedUrl === "function"
            ? ContentContract.toYouTubeEmbedUrl(video.video)
            : video.video;

    iframe.style.display = "block";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.maxWidth = "100%";
    iframe.style.maxHeight = "100%";

    return;
}

    // Everything else is treated as a normal video URL.
    activePlayerType = "video";

    if (!videoElement) return;

    videoElement.style.display = "block";
    videoElement.src = video.video;
    videoElement.load();

    const playRequest = videoElement.play();

    if (
        playRequest &&
        typeof playRequest.catch === "function"
    ) {
        playRequest.catch(() => {});
    }
}



function recordRecentVideo(video) {
    if (!video || !video.id) return;
    const key = "skyvideo-recent";
    let ids = [];
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        ids = Array.isArray(value) ? value : [];
    } catch (e) {}
    ids = ids.filter(id => id !== video.id);
    ids.unshift(video.id);
    try { localStorage.setItem(key, JSON.stringify(ids.slice(0, 50))); }
    catch (e) {}
}


function stopForMediaManager() {

    clearActivePlayer();

    currentVideo = null;
    activePlayerType = "video";

    if (titleElement) {
        titleElement.textContent = "";
    }

    updateStatusBar(null);
    setStatusMessage("");

    if (viewerElement) {
        viewerElement.classList.remove("has-video");
    }

    if (landingElement) {
        landingElement.classList.remove("hidden");
    }

    renderLanding();
}


function openVideo(video) {

    if (!video || !videoElement) {
        return;
    }

    if (
        window.MediaManager &&
        typeof MediaManager.claim === "function"
    ) {
        MediaManager.claim(
            "video",
            stopForMediaManager
        );
    }

    currentVideo =
        video;

    lastSelectedVideo =
        video;

    recordRecentVideo(video);

    /*
    ---------------------------------------------------
     Close the narrow library exactly as SkyReader does
     when a book is selected.
    ---------------------------------------------------
    */

    if (
        window.VideoUI &&
        typeof VideoUI.closeDrawer === "function"
    ) {
        VideoUI.closeDrawer();
    }


    /*
    ---------------------------------------------------
     Update title
    ---------------------------------------------------
    */

    if (titleElement) {

        titleElement.textContent =
            video.title || "";

    }

    updateStatusBar(video);

    setStatusMessage("Loading…");


    /*
    ---------------------------------------------------
     Hide landing
    ---------------------------------------------------
    */

    if (landingElement) {

        landingElement.classList.add(
            "hidden"
        );

    }


    /*
    ---------------------------------------------------
     Reset current source
    ---------------------------------------------------
    */

loadVideoPlayer(video);

    /*
    ---------------------------------------------------
     Viewer state
    ---------------------------------------------------
    */

    if (viewerElement) {

        viewerElement.classList.add(
            "has-video"
        );

    }


    refreshVideoLayout();

    // Re-run once the browser has actually committed the
    // "has-video" layout (guards against measuring the
    // viewer's box on the same tick it became visible).
    window.requestAnimationFrame(() => {
        refreshVideoLayout();
    });


    /*
    ---------------------------------------------------
     Keep landing's View Again item current.
    ---------------------------------------------------
    */



    renderLanding();

}


/*
-------------------------------------------------------
 Close video
-------------------------------------------------------
*/

function closeVideo() {

    if (!videoElement) {
        return;
    }

clearActivePlayer();

if (
    window.MediaManager &&
    typeof MediaManager.release === "function"
) {
    MediaManager.release("video");
}

currentVideo = null;
activePlayerType = "video";

    if (titleElement) {
        titleElement.textContent = "";
    }

    updateStatusBar(null);

    setStatusMessage("");

    if (viewerElement) {

        viewerElement.classList.remove(
            "has-video"
        );

    }

    /*
    ---------------------------------------------------
     Show landing again.
    ---------------------------------------------------
    */

    if (landingElement) {

        landingElement.classList.add(
            "hidden"
        );

        if (window.__skyVideoLandingTimer) {
            window.clearTimeout(
                window.__skyVideoLandingTimer
            );
        }

        window.__skyVideoLandingTimer =
            window.setTimeout(() => {

                if (currentVideo) {
                    return;
                }

                landingElement.classList.remove(
                    "hidden"
                );

            }, 1000);
    }

    renderLanding();
}


/*
-------------------------------------------------------
 Metadata
-------------------------------------------------------
*/

function handleMetadata() {

    const width =
        videoElement.videoWidth;

    const height =
        videoElement.videoHeight;


    if (!width || !height) {
        return;
    }


    const ratio =
        width / height;


    if (viewerElement) {

        viewerElement.dataset.videoWidth =
            width;

        viewerElement.dataset.videoHeight =
            height;

        viewerElement.dataset.videoRatio =
            ratio;

    }


    refreshVideoLayout();

}


/*
-------------------------------------------------------
 Compute the exact box the video should render at

 Sizes the <video> element itself to the largest
 rectangle that (a) fits inside the viewer's available
 content area and (b) preserves the source's aspect
 ratio exactly (no cropping, no distortion).

 This is deliberately NOT done by stretching the
 element to 100%/100% and letting object-fit:contain
 "shrink" the picture inside it — that leaves letterboxed
 dead-space *inside* the element's own box, which is what
 makes the native controls bar (and its gradient) spill
 past the visible edges of the picture. Sizing the element
 itself to the content rectangle keeps native controls
 flush with the actual video, and still lets a
 low-resolution source scale UP to fill the viewer,
 since we're computing the box from the container size,
 not from the video's native pixel dimensions.
-------------------------------------------------------
*/

function computeVideoBoxSize() {

    if (!viewerElement) {
        return null;
    }

    const styles =
        window.getComputedStyle(viewerElement);

    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;

    // Small breathing-room gutter, matching the previous
    // "calc(100% - 16px)" visual spacing.
    const GUTTER = 16;

    const availableWidth =
        viewerElement.clientWidth -
        paddingLeft - paddingRight - GUTTER;

    const availableHeight =
        viewerElement.clientHeight -
        paddingTop - paddingBottom - GUTTER;

    if (availableWidth <= 0 || availableHeight <= 0) {
        return null;
    }

    const ratio =
        parseFloat(viewerElement.dataset.videoRatio) ||
        (16 / 9);

    let width;
    let height;

    if (availableWidth / availableHeight > ratio) {
        // Viewer is relatively wider than the video —
        // height is the limiting dimension.
        height = availableHeight;
        width = height * ratio;
    } else {
        // Viewer is relatively taller than the video —
        // width is the limiting dimension.
        width = availableWidth;
        height = width / ratio;
    }

    return { width, height };
}


/*
-------------------------------------------------------
 Refresh video layout
-------------------------------------------------------
*/

function refreshVideoLayout() {

    if (!viewerElement || !videoElement) {
        return;
    }


    /*
    -------------------------------------------------------
     No active video

     Keep the video completely out of the landing layout.
    -------------------------------------------------------
    */

if (!currentVideo) {

    if (videoElement) {
        videoElement.style.display = "none";
    }

    if (iframeElement) {
        iframeElement.style.display = "none";
    }

    return;
}

if (activePlayerType === "iframe") {

    if (videoElement) {
        videoElement.style.display = "none";
    }

    if (iframeElement) {
        iframeElement.style.display = "block";
        iframeElement.style.width = "100%";
        iframeElement.style.height = "100%";
    }

    return;
}


    /*
    -------------------------------------------------------
     Active video

     The viewer remains fixed.

     The <video> element itself is sized to the exact
     rectangle that fills the viewer while preserving the
     source's aspect ratio — no cropping, no distortion,
     and no letterboxed slack inside the element (which
     would otherwise let native controls overhang past the
     visible picture).
    -------------------------------------------------------
    */

    videoElement.style.display =
        "block";

    const box =
        computeVideoBoxSize();

    if (box) {

        videoElement.style.width =
            box.width + "px";

        videoElement.style.height =
            box.height + "px";

    } else {

        // Fallback if the viewer isn't laid out yet.
        videoElement.style.width =
            "100%";

        videoElement.style.height =
            "100%";
    }

    videoElement.style.maxWidth =
        "100%";

    videoElement.style.maxHeight =
        "100%";

    videoElement.style.objectFit =
        "contain";
}


/*
-------------------------------------------------------
 Playback
-------------------------------------------------------
*/

function play() {

    if (!videoElement) {
        return;
    }

    return videoElement.play();
}


function pause() {

    if (!videoElement) {
        return;
    }

    videoElement.pause();
}


function togglePlay() {

    if (!videoElement) {
        return;
    }


    if (videoElement.paused) {

        return play();

    }


    pause();

}


/*
-------------------------------------------------------
 Mute
-------------------------------------------------------
*/

function setMuted(value) {

    if (!videoElement) {
        return;
    }

    videoElement.muted =
        Boolean(value);

}


function toggleMute() {

    if (!videoElement) {
        return;
    }

    videoElement.muted =
        !videoElement.muted;

}


/*
-------------------------------------------------------
 Fullscreen
-------------------------------------------------------
*/

function fullscreen() {


    const target =
        activePlayerType === "iframe"
            ? iframeElement
            : videoElement;

    if (!target) return;

    if (document.fullscreenElement) {
        document.exitFullscreen();
        return;
    }

    if (target.requestFullscreen) {
        target.requestFullscreen();
    }
}


/*
-------------------------------------------------------
 Current video
-------------------------------------------------------
*/

function getCurrentVideo() {

    return currentVideo;

}


/*
-------------------------------------------------------
 Public API
-------------------------------------------------------
*/

return {

    init,
    openVideo,
    closeVideo,

    play,
    pause,
    togglePlay,

    setMuted,
    toggleMute,

    fullscreen,

    getCurrentVideo,

    renderLanding

};

})();