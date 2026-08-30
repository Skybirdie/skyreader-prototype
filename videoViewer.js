"use strict";

/*
=========================================================
 MMicj Video Viewer — Phase 2

 Responsibilities:

   1. Load Video Contract
   2. Normalize video records
   3. Display video library
   4. Open selected video
   5. Play direct video sources
   6. Recognize YouTube sources
   7. Navigate previous/next
   8. Display video metadata

 The contract adapter remains the single data boundary.

 No Glide-specific logic belongs in this file.
=========================================================
*/

window.VideoViewer = (function(){

const api = {};

let manifest = null;

let videos = [];

let currentIndex = -1;

let videoElement = null;


/*-------------------------------------------------------
 DOM helper
-------------------------------------------------------*/

function $(id){
    return document.getElementById(id);
}


/*-------------------------------------------------------
 URL normalization
-------------------------------------------------------*/

function cleanUrl(value){

    let text =
        String(value ?? "").trim();


    /*
    Glide may wrap the value in quotation marks.
    */

    if(
        text.length >= 2 &&
        text.startsWith('"') &&
        text.endsWith('"')
    ){
        text =
            text.slice(1,-1).trim();
    }


    /*
    Glide Markdown:

    [https://example.com/video.mp4](https://example.com/video.mp4)
    */

    text =
        text.replace(
            /^\[([^\]]+)\]\(([^)]+)\)$/,
            "$2"
        );


    return text.trim();
}


/*-------------------------------------------------------
 Determine source type
-------------------------------------------------------*/

function sourceType(url){

    const value =
        cleanUrl(url);


    try{

        const parsed =
            new URL(
                value,
                window.location.href
            );


        const host =
            parsed.hostname.toLowerCase();


        if(
            host === "youtube.com" ||
            host === "www.youtube.com" ||
            host === "m.youtube.com" ||
            host === "youtu.be" ||
            host === "www.youtube-nocookie.com"
        ){

            return "youtube";

        }

    }catch(error){

        /*
        Invalid URL is allowed to fall through to
        native HTML5 handling so the browser can report
        the actual loading problem.
        */

    }


    return "html5";
}


/*-------------------------------------------------------
 Extract YouTube video ID
-------------------------------------------------------*/

function youtubeId(url){

    try{

        const parsed =
            new URL(
                cleanUrl(url),
                window.location.href
            );


        const host =
            parsed.hostname.toLowerCase();


        if(
            host === "youtu.be" ||
            host === "www.youtu.be"
        ){

            return parsed
                .pathname
                .replace(/^\/+/,"")
                .split("/")[0];

        }


        if(
            host.includes("youtube.com")
        ){

            const queryId =
                parsed.searchParams.get("v");


            if(queryId){
                return queryId;
            }


            const parts =
                parsed.pathname
                .split("/")
                .filter(Boolean);


            const embedIndex =
                parts.indexOf("embed");


            if(
                embedIndex >= 0 &&
                parts[embedIndex + 1]
            ){

                return parts[
                    embedIndex + 1
                ];

            }


            const shortsIndex =
                parts.indexOf("shorts");


            if(
                shortsIndex >= 0 &&
                parts[shortsIndex + 1]
            ){

                return parts[
                    shortsIndex + 1
                ];

            }

        }

    }catch(error){

        console.warn(
            "Unable to identify YouTube video.",
            error
        );

    }


    return "";
}


/*-------------------------------------------------------
 Status
-------------------------------------------------------*/

function setStatus(
    message,
    isError = false
){

    const element =
        $("statusMessage");


    if(!element){
        return;
    }


    element.textContent =
        message || "";


    element.classList.toggle(
        "error",
        !!isError
    );

}


/*-------------------------------------------------------
 Empty state
-------------------------------------------------------*/

function showEmpty(){

    $("emptyState")
        ?.classList
        .remove("hidden");


    $("videoStage")
        ?.classList
        .add("hidden");


    $("videoInfo")
        ?.classList
        .add("hidden");

}


/*-------------------------------------------------------
 Viewer state
-------------------------------------------------------*/

function showViewer(){

    $("emptyState")
        ?.classList
        .add("hidden");


    $("videoStage")
        ?.classList
        .remove("hidden");


    $("videoInfo")
        ?.classList
        .remove("hidden");

}


/*-------------------------------------------------------
 Render video list
-------------------------------------------------------*/

function renderList(){

    const list =
        $("videoList");


    if(!list){
        return;
    }


    list.innerHTML = "";


    videos.forEach(
        (item,index)=>{

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "videoCard";


            button.dataset.index =
                String(index);


            if(index === currentIndex){

                button.classList.add(
                    "active"
                );

            }


            const thumbnail =
                cleanUrl(
                    item.thumbnail
                );


            const thumb =
                document.createElement(
                    "div"
                );


            thumb.className =
                "videoCardThumb";


            if(thumbnail){

                const image =
                    document.createElement(
                        "img"
                    );


                image.src =
                    thumbnail;


                image.alt =
                    "";


                image.loading =
                    "lazy";


                image.onerror =
                    function(){

                        this.style.display =
                            "none";

                    };


                thumb.appendChild(
                    image
                );

            }else{

                thumb.textContent =
                    "No thumbnail";

            }


            const text =
                document.createElement(
                    "div"
                );


            text.className =
                "videoCardText";


            const title =
                document.createElement(
                    "strong"
                );


            title.textContent =
                item.title ||
                "Untitled video";


            const subtitle =
                document.createElement(
                    "span"
                );


            subtitle.textContent =
                item.subtitle ||
                "";


            text.appendChild(title);
            text.appendChild(subtitle);


            button.appendChild(thumb);
            button.appendChild(text);


            button.addEventListener(
                "click",
                function(){

                    open(index);

                }
            );


            list.appendChild(
                button
            );

        }
    );

}


/*-------------------------------------------------------
 Render metadata
-------------------------------------------------------*/

function renderInfo(item){

    $("videoTitle").textContent =
        item.title ||
        "Untitled video";


    $("videoSubtitle").textContent =
        item.subtitle ||
        "";


    $("videoAuthor").textContent =
        item.author &&
        item.author !== "unknown"
            ? item.author
            : "";


    $("videoCategory").textContent =
        item.category &&
        item.category !== "unknown"
            ? item.category
            : "";


    $("videoLength").textContent =
        item.videoLength &&
        item.videoLength !== "unknown"
            ? item.videoLength
            : "";


    $("videoDate").textContent =
        item.date ||
        "";

}


/*-------------------------------------------------------
 Detect native MIME type
-------------------------------------------------------*/

function detectMimeType(url){

    const clean =
        url
            .split("?")[0]
            .toLowerCase();


    if(clean.endsWith(".mp4")){
        return "video/mp4";
    }


    if(clean.endsWith(".webm")){
        return "video/webm";
    }


    if(
        clean.endsWith(".ogv") ||
        clean.endsWith(".ogg")
    ){

        return "video/ogg";

    }


    return "";

}


/*-------------------------------------------------------
 Create native HTML5 video
-------------------------------------------------------*/

function createHtml5Player(item){

    const stage =
        $("videoStage");


    stage.innerHTML = "";


    const video =
        document.createElement(
            "video"
        );


    video.id =
        "videoPlayer";


    video.className =
        "videoPlayer";


    video.controls =
        true;


    video.preload =
        "metadata";


    video.playsInline =
        true;


    const source =
        document.createElement(
            "source"
        );


    source.src =
        cleanUrl(
            item.video
        );


    const mime =
        detectMimeType(
            source.src
        );


    if(mime){

        source.type =
            mime;

    }


    video.appendChild(
        source
    );


    video.addEventListener(
        "loadedmetadata",
        function(){

            setStatus("");

        }
    );


    video.addEventListener(
        "error",
        function(){

            setStatus(
                "Unable to load this video source.",
                true
            );

        }
    );


    stage.appendChild(
        video
    );


    videoElement =
        video;

}


/*-------------------------------------------------------
 Create YouTube player
-------------------------------------------------------*/

function createYouTubePlayer(item){

    const stage =
        $("videoStage");


    stage.innerHTML = "";


    const id =
        youtubeId(
            item.video
        );


    if(!id){

        setStatus(
            "Unable to identify the YouTube video.",
            true
        );

        return;

    }


    const iframe =
        document.createElement(
            "iframe"
        );


    iframe.className =
        "videoPlayer youtubePlayer";


    iframe.src =
        "https://www.youtube.com/embed/" +
        encodeURIComponent(id) +
        "?rel=0";


    iframe.title =
        item.title ||
        "Video";


    iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";


    iframe.allowFullscreen =
        true;


    iframe.referrerPolicy =
        "strict-origin-when-cross-origin";


    stage.appendChild(
        iframe
    );


    videoElement =
        null;

}


/*-------------------------------------------------------
 Open video
-------------------------------------------------------*/

function open(index){

    if(
        !Number.isInteger(index) ||
        index < 0 ||
        index >= videos.length
    ){

        return;

    }


    /*
    Stop the previous native video before replacing it.
    */

    if(videoElement){

        try{
            videoElement.pause();
        }catch(error){}

    }


    currentIndex =
        index;


    const item =
        videos[index];


    renderList();

    renderInfo(item);

    showViewer();


    const url =
        cleanUrl(
            item.video
        );


    if(!url){

        setStatus(
            "This video has no source URL.",
            true
        );

        return;

    }


    if(
        sourceType(url) === "youtube"
    ){

        createYouTubePlayer(
            item
        );

    }else{

        createHtml5Player(
            item
        );

    }


    document.title =
        item.title
            ? item.title +
              " — MMicj Video"
            : "MMicj Video";

}


/*-------------------------------------------------------
 Next
-------------------------------------------------------*/

function next(){

    if(!videos.length){
        return;
    }


    const nextIndex =
        currentIndex <
        videos.length - 1

            ? currentIndex + 1

            : 0;


    open(nextIndex);

}


/*-------------------------------------------------------
 Previous
-------------------------------------------------------*/

function previous(){

    if(!videos.length){
        return;
    }


    const previousIndex =
        currentIndex > 0

            ? currentIndex - 1

            : videos.length - 1;


    open(previousIndex);

}


/*-------------------------------------------------------
 Normalize incoming records
-------------------------------------------------------*/

function normalizeVideos(rawVideos){

    return rawVideos.map(
        (raw,index)=>({

            id:
                String(
                    raw?.id ??
                    ("video_" + index)
                ).trim(),


            title:
                String(
                    raw?.title ??
                    ""
                ).trim(),


            subtitle:
                String(
                    raw?.subtitle ??
                    ""
                ).trim(),


            thumbnail:
                cleanUrl(
                    raw?.thumbnail ??
                    ""
                ),


            video:
                cleanUrl(
                    raw?.video ??
                    raw?.url ??
                    raw?.videoUrl ??
                    ""
                ),


            author:
                String(
                    raw?.author ??
                    ""
                ).trim(),


            category:
                String(
                    raw?.category ??
                    ""
                ).trim(),


            videoLength:
                raw?.videoLength ??
                raw?.video_length ??
                raw?.duration ??
                "unknown",


            date:
                String(
                    raw?.date ??
                    ""
                ).trim()

        })
    );

}


/*-------------------------------------------------------
 Load contract
-------------------------------------------------------*/

async function load(){

    if(
        !window.VideoGlideContract ||
        typeof window.VideoGlideContract.load !==
            "function"
    ){

        throw new Error(
            "VideoGlideContract is unavailable."
        );

    }


    manifest =
        await window.VideoGlideContract.load();


    if(!manifest){

        videos = [];

        showEmpty();

        setStatus(
            "No video contract was supplied."
        );

        return;

    }


    const rawVideos =
        Array.isArray(manifest)
            ? manifest
            : manifest.videos;


    if(!Array.isArray(rawVideos)){

        throw new Error(
            "Video contract does not contain a video array."
        );

    }


    videos =
        normalizeVideos(
            rawVideos
        );


    renderList();


    if(videos.length){

        open(0);


        setStatus(
            videos.length === 1
                ? "1 video loaded."
                : videos.length +
                  " videos loaded."
        );

    }else{

        showEmpty();

        setStatus(
            "The video contract contains no videos."
        );

    }

}


/*-------------------------------------------------------
 Close
-------------------------------------------------------*/

function close(){

    if(videoElement){

        try{
            videoElement.pause();
        }catch(error){}

    }


    videoElement =
        null;


    currentIndex =
        -1;


    $("videoStage").innerHTML =
        "";


    showEmpty();

    renderList();

    document.title =
        "MMicj Video";

}


/*-------------------------------------------------------
 Initialize
-------------------------------------------------------*/

function init(){

    $("previousButton")
        ?.addEventListener(
            "click",
            previous
        );


    $("nextButton")
        ?.addEventListener(
            "click",
            next
        );


    $("closeButton")
        ?.addEventListener(
            "click",
            close
        );


    load().catch(
        function(error){

            console.error(
                "Video Viewer startup error:",
                error
            );


            showEmpty();


            setStatus(
                error?.message ||
                "Unable to load video contract.",
                true
            );

        }
    );

}


/*-------------------------------------------------------
 Public API
-------------------------------------------------------*/

api.init =
    init;

api.load =
    load;

api.open =
    open;

api.next =
    next;

api.previous =
    previous;

api.close =
    close;


return api;

})();


document.addEventListener(
    "DOMContentLoaded",
    function(){

        VideoViewer.init();

    }
);