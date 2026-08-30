"use strict";

/*
=========================================================
 Video Viewer — Phase 2 Minimal Test

 Responsibilities:
   1. Load the Glide video contract
   2. Render the supplied videos
   3. Support direct video URLs
   4. Support YouTube URLs
   5. Dismiss the startup loading screen
=========================================================
*/

(function(){

function get(id){
    return document.getElementById(id);
}


/*-------------------------------------------------------
 Loading screen
-------------------------------------------------------*/

function hideLoading(){
    const screen=get("reloadScreen");

    if(screen){
        screen.classList.add("isReady");
    }
}


/*-------------------------------------------------------
 Error display
-------------------------------------------------------*/

function showError(message){

    console.error("Video Viewer:",message);

    const container=get("videoError");

    if(container){
        container.textContent=message;
        container.hidden=false;
    }

}


/*-------------------------------------------------------
 URL normalization
-------------------------------------------------------*/

function normalizeUrl(value){

    if(value===undefined || value===null){
        return "";
    }

    let url=String(value).trim();

    if(!url){
        return "";
    }

    /*
    Glide may provide Markdown links:

    [https://example.com/video.mp4](https://example.com/video.mp4)

    Extract the actual URL.
    */

    const markdownMatch=url.match(
        /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/
    );

    if(markdownMatch){
        return markdownMatch[2].trim();
    }


    /*
    Handle angle brackets or accidental surrounding
    quotation marks.
    */

    url=url.replace(/^["']+|["']+$/g,"");
    url=url.replace(/^<|>$/g,"");

    return url.trim();
}


/*-------------------------------------------------------
 YouTube detection
-------------------------------------------------------*/

function getYouTubeId(url){

    try{

        const parsed=new URL(url);

        /*
        youtube.com/watch?v=XXXXXXXXXXX
        */

        if(
            parsed.hostname.includes("youtube.com") &&
            parsed.searchParams.get("v")
        ){
            return parsed.searchParams.get("v");
        }


        /*
        youtu.be/XXXXXXXXXXX
        */

        if(parsed.hostname==="youtu.be"){
            return parsed.pathname.slice(1).split("/")[0];
        }


        /*
        youtube.com/embed/XXXXXXXXXXX
        */

        const embedMatch=parsed.pathname.match(
            /\/embed\/([^/?]+)/
        );

        if(
            parsed.hostname.includes("youtube.com") &&
            embedMatch
        ){
            return embedMatch[1];
        }

    }catch(error){
        return null;
    }

    return null;
}


/*-------------------------------------------------------
 Render one video
-------------------------------------------------------*/

function renderVideo(video){

    const url=normalizeUrl(video.video);

    if(!url){
        return null;
    }


    const wrapper=document.createElement("article");

    wrapper.className="videoCard";


    const title=document.createElement("h2");

    title.textContent=video.title || "Untitled video";

    wrapper.appendChild(title);


    const youtubeId=getYouTubeId(url);


    if(youtubeId){

        const iframe=document.createElement("iframe");

        iframe.className="videoPlayer";

        iframe.src=
            "https://www.youtube.com/embed/" +
            encodeURIComponent(youtubeId);

        iframe.title=
            video.title || "Video";

        iframe.allow=
            "accelerometer; autoplay; clipboard-write; " +
            "encrypted-media; gyroscope; picture-in-picture; web-share";

        iframe.allowFullscreen=true;

        wrapper.appendChild(iframe);

    }else{

        const player=document.createElement("video");

        player.className="videoPlayer";

        player.controls=true;

        player.preload="metadata";

        player.playsInline=true;

        player.src=url;


        if(video.thumbnail){

            const thumbnail=normalizeUrl(video.thumbnail);

            if(thumbnail){
                player.poster=thumbnail;
            }

        }


        wrapper.appendChild(player);
    }


    return wrapper;
}


/*-------------------------------------------------------
 Render manifest
-------------------------------------------------------*/

function renderVideos(manifest){

    const container=get("videoList");

    if(!container){
        throw new Error("videoList element not found.");
    }


    container.innerHTML="";


    const videos=
        manifest &&
        Array.isArray(manifest.videos)
            ? manifest.videos
            : [];


    if(!videos.length){

        const empty=document.createElement("p");

        empty.textContent="No videos were supplied.";

        container.appendChild(empty);

        return;
    }


    videos.forEach(function(video){

        const card=renderVideo(video);

        if(card){
            container.appendChild(card);
        }

    });

}


/*-------------------------------------------------------
 Startup
-------------------------------------------------------*/

async function init(){

    try{

        console.log("Video Viewer: initializing...");


        if(
            !window.VideoGlideContract ||
            typeof window.VideoGlideContract.load!=="function"
        ){

            throw new Error(
                "VideoGlideContract is not available."
            );

        }


        console.log(
            "Video Viewer: loading Glide video contract..."
        );


        const manifest=
            await window.VideoGlideContract.load();


        if(!manifest){

            throw new Error(
                "No video contract was found."
            );

        }


        console.log(
            "Video Viewer: contract loaded.",
            manifest
        );


        renderVideos(manifest);


        console.log(
            "Video Viewer: videos rendered."
        );


    }catch(error){

        console.error(
            "Video Viewer initialization failed:",
            error
        );


        showError(
            error && error.message
                ? error.message
                : "Unable to load videos."
        );


    }finally{

        /*
        IMPORTANT:

        Never leave the startup screen permanently visible.
        */

        hideLoading();

    }

}


/*-------------------------------------------------------
 Start after DOM is ready
-------------------------------------------------------*/

if(document.readyState==="loading"){

    document.addEventListener(
        "DOMContentLoaded",
        init
    );

}else{

    init();

}

})();