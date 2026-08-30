"use strict";

/*
=========================================================

 SkyReader Video Viewer

=========================================================
*/

window.VideoViewer = (function () {

    let viewerElement = null;
    let videoElement = null;
    let titleElement = null;

    let currentVideo = null;


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


        if (!videoElement) {
            return;
        }


        /*
        Detect the actual intrinsic dimensions
        when the video's metadata becomes available.
        */

        videoElement.addEventListener(
            "loadedmetadata",
            handleMetadata
        );


        /*
        Keep the video constrained when
        the viewer changes size.
        */

        window.addEventListener(
            "resize",
            refreshVideoLayout
        );


        refreshVideoLayout();
    }


    /*
    -------------------------------------------------------
     Open video
    -------------------------------------------------------
    */

    function openVideo(video) {

        if (!video || !videoElement) {
            return;
        }

        currentVideo =
            video;


        /*
        Update title
        */

        if (titleElement) {

            titleElement.textContent =
                video.title || "";

        }


        /*
        Reset current source
        */

        videoElement.pause();

        videoElement.removeAttribute(
            "src"
        );

        videoElement.load();


        /*
        Apply source
        */

        videoElement.src =
            video.video;


        /*
        Allow the browser to determine
        intrinsic video dimensions.
        */

        videoElement.load();


        /*
        Update viewer state.
        */

        if (viewerElement) {

            viewerElement.classList.add(
                "has-video"
            );

        }


        refreshVideoLayout();
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

        videoElement.pause();

        videoElement.removeAttribute(
            "src"
        );

        videoElement.load();

        currentVideo =
            null;


        if (titleElement) {
            titleElement.textContent = "";
        }


        if (viewerElement) {

            viewerElement.classList.remove(
                "has-video"
            );

        }
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


        /*
        Store the detected ratio on the
        viewer for CSS/debugging/future use.
        */

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
     Refresh video layout
    -------------------------------------------------------
    */

    function refreshVideoLayout() {

        if (!viewerElement || !videoElement) {
            return;
        }


        /*
        The viewer itself never changes size
        because of the video.

        The video is constrained inside it.
        */

        videoElement.style.maxWidth =
            "100%";

        videoElement.style.maxHeight =
            "100%";

        videoElement.style.width =
            "100%";

        videoElement.style.height =
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

        if (!videoElement) {
            return;
        }

        if (
            document.fullscreenElement
        ) {

            document.exitFullscreen();

            return;
        }


        if (
            videoElement.requestFullscreen
        ) {

            videoElement.requestFullscreen();

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

        getCurrentVideo

    };

})();