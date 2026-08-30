"use strict";

/*
=========================================================

 SkyReader Video Library

=========================================================
*/

window.VideoLibrary = (function () {

    let videos = [];
    let selectedVideoId = null;

    let libraryElement = null;
    let gridElement = null;


    /*
    -------------------------------------------------------
     Initialize
    -------------------------------------------------------
    */

    function init(options = {}) {

        libraryElement =
            options.libraryElement ||
            document.getElementById("videoLibrary");

        gridElement =
            options.gridElement ||
            document.getElementById("videoLibraryGrid");

        return render();
    }


    /*
    -------------------------------------------------------
     Load
    -------------------------------------------------------
    */

    function load(payload) {

        videos = VideoContract.parse(payload);

        render();

        return videos;
    }


    /*
    -------------------------------------------------------
     Render
    -------------------------------------------------------
    */

    function render() {

        if (!gridElement) {
            return;
        }

        gridElement.innerHTML = "";

        videos.forEach(video => {

            const card =
                createCard(video);

            gridElement.appendChild(card);

        });

        refreshSelection();
    }


    /*
    -------------------------------------------------------
     Create card
    -------------------------------------------------------
    */

    function createCard(video) {

        const card =
            document.createElement("button");

        card.type = "button";

        card.className =
            "video-card";

        card.dataset.videoId =
            video.id;


        /*
        Thumbnail
        */

        const thumbnail =
            document.createElement("div");

        thumbnail.className =
            "video-card-thumbnail";


        if (video.thumbnail) {

            const image =
                document.createElement("img");

            image.src =
                video.thumbnail;

            image.alt =
                video.title;

            image.loading =
                "lazy";

            thumbnail.appendChild(image);

        }
        else {

            thumbnail.classList.add(
                "video-card-no-thumbnail"
            );

            thumbnail.textContent =
                "VIDEO";
        }


        /*
        Play indicator
        */

        const play =
            document.createElement("span");

        play.className =
            "video-card-play";

        play.textContent =
            "▶";

        thumbnail.appendChild(play);


        /*
        Information
        */

        const info =
            document.createElement("div");

        info.className =
            "video-card-info";


        const title =
            document.createElement("div");

        title.className =
            "video-card-title";

        title.textContent =
            video.title;


        const meta =
            document.createElement("div");

        meta.className =
            "video-card-meta";

        meta.textContent =
            video.category || "";


        info.appendChild(title);
        info.appendChild(meta);


        card.appendChild(thumbnail);
        card.appendChild(info);


        /*
        Selection
        */

        card.addEventListener(
            "click",
            () => {

                select(video.id);

            }
        );


        return card;
    }


    /*
    -------------------------------------------------------
     Select
    -------------------------------------------------------
    */

    function select(id) {

        const video =
            videos.find(
                item => item.id === id
            );

        if (!video) {
            return;
        }

        selectedVideoId =
            id;

        refreshSelection();


        /*
        Hand off to Viewer.

        The Library never controls the
        video element directly.
        */

        if (
            window.VideoViewer &&
            typeof VideoViewer.openVideo === "function"
        ) {

            VideoViewer.openVideo(video);

        }
    }


    /*
    -------------------------------------------------------
     Selection state
    -------------------------------------------------------
    */

    function refreshSelection() {

        if (!gridElement) {
            return;
        }

        const cards =
            gridElement.querySelectorAll(
                ".video-card"
            );

        cards.forEach(card => {

            card.classList.toggle(
                "selected",
                card.dataset.videoId ===
                selectedVideoId
            );

        });
    }


    /*
    -------------------------------------------------------
     Get videos
    -------------------------------------------------------
    */

    function getVideos() {

        return [...videos];
    }


    /*
    -------------------------------------------------------
     Public API
    -------------------------------------------------------
    */

    return {

        init,
        load,
        render,
        select,
        getVideos

    };

})();