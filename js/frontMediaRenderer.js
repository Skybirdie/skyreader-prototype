"use strict";

/*
=========================================================
 SkyMedia Front Page — Centerpiece Media Renderer

 Keeps the Front Page centerpiece independent from the full
 Reader / Video Viewer / Slideshow applications.
=========================================================
*/
window.FrontMediaRenderer = (function(){
    let host=null, activeItem=null, cleanupFn=null, generation=0;



    function icon(name){
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("class","icon"); svg.setAttribute("aria-hidden","true");
        const use=document.createElementNS("http://www.w3.org/2000/svg","use");
        use.setAttribute("href",`#icon-${name}`); svg.appendChild(use); return svg;
    }
    function control(name,label,onClick){
        const b=document.createElement("button"); b.type="button"; b.className="front-media-control"; b.title=label; b.setAttribute("aria-label",label); b.appendChild(icon(name));
        b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();onClick(b);}); return b;
    }
    function shell(item,type){
    host.innerHTML="";
    host.dataset.mediaType=type;

    const CENTERPIECE_LABELS = {
        "Meditation": "Meditation Mondays",
        "Book Club": "Book Club Tuesdays",
        "Affirmations": "We Affirm Wednesdays",
        "Feed My Sheep": "Feed My Sheep Fridays",
        "BYOB": "BYOB Sundays",
        "Sayings": "Sayings Saturdays",
        "Testimonies": "Testimony Thursdays"
    };

    const category = String(item?.category || "").trim();

    const matchedCategory = Object.keys(CENTERPIECE_LABELS).find(
        key => key.toLowerCase() === category.toLowerCase()
    );

    const title=document.createElement("div");
    title.className="front-media-title";
    title.textContent =
        matchedCategory
            ? CENTERPIECE_LABELS[matchedCategory]
            : category || "";

    const content=document.createElement("div");
    content.className="front-media-content";

    const controls=document.createElement("div");
    controls.className="front-media-controls";

    const controlsLeft=document.createElement("div");
    controlsLeft.className="front-media-controls-left";

    const controlsCenter=document.createElement("div");
    controlsCenter.className="front-media-controls-center";

    const controlsRight=document.createElement("div");
    controlsRight.className="front-media-controls-right";

    controls.append(
        controlsLeft,
        controlsCenter,
        controlsRight
    );

    const status=document.createElement("span");
    status.className="front-media-status";

    host.append(
        title,
        content,
        controls,
        status
    );

    return {
        content,
        controls,
        controlsLeft,
        controlsCenter,
        controlsRight,
        status
    };
}

function openFull(item){
    if(!item || !item.id) return;

    try{
        if(window.AppSwitcher){
            AppSwitcher.show(item.section);
        }

        requestAnimationFrame(()=>{
    try{
        if(item.section === "reader" &&
           window.Library &&
           typeof Library.open === "function"){
            Library.open(item.id);
        }
        else if(item.section === "video" &&
                window.VideoLibrary &&
                typeof VideoLibrary.select === "function"){
            VideoLibrary.select(item.id);
        }
        else if(item.section === "slideshow" &&
                window.SlideshowLibrary &&
                typeof SlideshowLibrary.select === "function"){
            SlideshowLibrary.select(item.id);
        }

        window.setTimeout(()=>{
            try{
                if(item.section === "reader"){
                    const viewer = document.getElementById("viewerArea");
                    if(viewer && !document.fullscreenElement){
                        viewer.requestFullscreen?.().catch(()=>{});
                    }
                }
                else if(item.section === "video"){
                    const video = document.getElementById("videoPlayer");
                    if(video && !document.fullscreenElement){
                        video.requestFullscreen?.().catch(()=>{});
                    }
                }
                else if(item.section === "slideshow"){
                    const viewer = document.getElementById("slideshowViewer");
                    if(viewer && !document.fullscreenElement){
                        viewer.requestFullscreen?.().catch(()=>{});
                    }
                }
            }catch(error){
                console.error("[FrontMediaRenderer] Unable to enter fullscreen.", error);
            }
        }, 100);
    }catch(error){
        console.error("[FrontMediaRenderer] Unable to open full viewer.", error);
    }
});

    }catch(error){
        console.error("[FrontMediaRenderer] Unable to switch to full viewer.", error);
    }
}
    function addOpenControl(controlsRight,item){
        controlsRight.appendChild(control("fullscreen","Open full viewer",()=>openFull(item)));
    }
    function renderVideo(item,token){
        const ui=shell(item,"video");

        /*
         * The unified Content Contract uses:
         *
         *     media = video URL
         *
         * YouTube is special because it cannot be rendered by a
         * normal <video> element.  The full Video Viewer already
         * resolves YouTube URLs through ContentContract and renders
         * them in an iframe.  The Front Page centerpiece must use
         * that same path.
         */

        const raw=item?.raw || item || {};

        function resolveVideoMedia(value){
            if(value == null) return "";

            if(typeof value === "string"){
                let url=value.trim();

                if(!url) return "";

                /*
                 * Glide can return a URL as:
                 *
                 * [URL](URL)
                 */
                const markdownMatch=
                    url.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

                if(markdownMatch){
                    url=
                        (markdownMatch[2] || markdownMatch[1] || "")
                            .trim();
                }

                return url;
            }

            if(typeof value === "object"){
                if(typeof value.url === "string"){
                    return resolveVideoMedia(value.url);
                }

                if(typeof value.video === "string"){
                    return resolveVideoMedia(value.video);
                }

                if(typeof value.media === "string"){
                    return resolveVideoMedia(value.media);
                }
            }

            if(Array.isArray(value)){
                return value.length
                    ? resolveVideoMedia(value[0])
                    : "";
            }

            return "";
        }

        /*
         * media is authoritative.  The remaining fields are
         * compatibility fallbacks for already-normalized runtime
         * objects.
         */
        let videoUrl=
            resolveVideoMedia(raw.media);

        if(!videoUrl){
            videoUrl=
                resolveVideoMedia(raw.video);
        }

        if(!videoUrl){
            videoUrl=
                resolveVideoMedia(raw.videoUrl);
        }

        if(!videoUrl){
            videoUrl=
                resolveVideoMedia(raw.url);
        }

        if(!videoUrl){
            console.error(
                "[FrontMediaRenderer] No video media URL found.",
                {
                    id:item?.id,
                    title:item?.title,
                    media:raw.media
                }
            );

            ui.status.textContent="Video unavailable";
            return;
        }

        /*
         * IMPORTANT:
         *
         * Keep this test aligned with VideoViewer.loadVideoPlayer().
         * ContentContract is now responsible for recognizing the
         * YouTube URL and converting it to the /embed/ form.
         */
        const isYouTube=
            window.ContentContract &&
            typeof ContentContract.isYouTubeUrl === "function" &&
            ContentContract.isYouTubeUrl(videoUrl);

        if(isYouTube){

            const iframe=
                document.createElement("iframe");

            iframe.className="front-media-video";
            iframe.title=item.title || "YouTube video";

            iframe.setAttribute(
                "allow",
                "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            );

            iframe.setAttribute(
                "allowfullscreen",
                ""
            );

            iframe.setAttribute(
                "frameborder",
                "0"
            );

            iframe.setAttribute(
                "loading",
                "lazy"
            );

            iframe.playsInline=true;

            const embedUrl=
                typeof ContentContract.toYouTubeEmbedUrl === "function"
                    ? ContentContract.toYouTubeEmbedUrl(videoUrl)
                    : videoUrl;

            /*
             * Use the exact same conversion as VideoViewer.
             */
            iframe.src=embedUrl;

            ui.content.appendChild(iframe);

            /*
             * YouTube playback is controlled by the YouTube iframe.
             * Do not create HTMLMediaElement controls here because
             * play(), pause(), currentTime and muted do not apply to
             * the iframe.
             */
            ui.status.textContent="";

            addOpenControl(
                ui.controlsRight,
                item
            );

            console.log(
                "[FrontMediaRenderer] YouTube centerpiece rendered.",
                {
                    id:item?.id,
                    source:videoUrl,
                    embed:embedUrl
                }
            );

            cleanupFn=()=>{
                iframe.src="about:blank";
                iframe.remove();
            };

            return;
        }

        /*
         * Normal video files continue to use the native HTML5
         * video element.
         */
        const video=
            document.createElement("video");

        video.className="front-media-video";
        video.preload="metadata";
        video.playsInline=true;
        video.controls=false;
        video.setAttribute(
            "aria-label",
            item.title || "Video"
        );

        video.src=videoUrl;

        ui.content.appendChild(video);

        const play=
            control(
                "play",
                "Play video",
                b=>{
                    if(video.paused){
                        video.play().catch(error=>{
                            console.warn(
                                "[FrontMediaRenderer] Video play failed.",
                                error
                            );
                        });
                    }else{
                        video.pause();
                    }
                }
            );

        const mute=
            control(
                "volume",
                "Mute video",
                ()=>{
                    video.muted=!video.muted;

                    mute.innerHTML="";
                    mute.appendChild(
                        icon(
                            video.muted
                                ?"volume-off"
                                :"volume"
                        )
                    );

                    mute.title=
                        video.muted
                            ?"Unmute video"
                            :"Mute video";

                    mute.setAttribute(
                        "aria-label",
                        mute.title
                    );
                }
            );

        const progress=
            document.createElement("input");

        progress.type="range";
        progress.min="0";
        progress.max="100";
        progress.value="0";
        progress.step="0.1";
        progress.className=
            "front-media-progress";

        progress.setAttribute(
            "aria-label",
            "Video progress"
        );

        progress.addEventListener(
            "input",
            ()=>{
                if(video.duration){
                    video.currentTime=
                        (Number(progress.value)/100)*
                        video.duration;
                }
            }
        );

        ui.controlsLeft.append(mute);

        ui.controlsCenter.append(
            play,
            progress
        );

        addOpenControl(
            ui.controlsRight,
            item
        );

        const sync=()=>{
            play.innerHTML="";

            play.appendChild(
                icon(
                    video.paused
                        ?"play"
                        :"pause"
                )
            );

            play.title=
                video.paused
                    ?"Play video"
                    :"Pause video";

            play.setAttribute(
                "aria-label",
                play.title
            );

            if(video.duration){
                progress.value=
                    (video.currentTime/video.duration)*100;
            }

            ui.status.textContent=
                video.duration
                    ?`${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
                    :"";
        };

        [
            "play",
            "pause",
            "timeupdate",
            "loadedmetadata",
            "ended"
        ].forEach(event=>{
            video.addEventListener(
                event,
                sync
            );
        });

        video.addEventListener(
            "ended",
            ()=>{
                progress.value=100;
            }
        );

        video.addEventListener(
            "error",
            ()=>{
                console.error(
                    "[FrontMediaRenderer] Centerpiece video failed to load.",
                    {
                        id:item?.id,
                        url:videoUrl,
                        media:raw.media,
                        error:video.error
                    }
                );

                ui.status.textContent=
                    "Video unavailable";
            }
        );

        cleanupFn=()=>{
            video.pause();
            video.removeAttribute("src");
            video.load();
        };

        sync();
    }
    function formatTime(v){if(!Number.isFinite(v))return "0:00";const m=Math.floor(v/60),s=Math.floor(v%60);return `${m}:${String(s).padStart(2,"0")}`;}

    /*
    ---------------------------------------------------------
    Slideshow background audio

    Slides/PDFs can carry their own configured audio track
    (item.raw.audioConfig, from ContentContract.normalizeAudio).
    Created once per render; playback is tied to the slideshow's
    own play/pause/restart state so it always starts from an
    explicit user gesture (satisfying autoplay policies) rather
    than trying to autoplay on load.
    ---------------------------------------------------------
    */
    function setupAudio(item){
        const url = item.raw && (typeof item.raw.audio === "string" ? item.raw.audio : item.raw.audio?.url);
        if(!url) return null;
        const audio=new Audio(url);
        audio.loop=false;
        audio.muted=false;
        return audio;
    }



async function renderSlideshow(item,token){
    const ui=shell(item,"slideshow");

    const slides=Array.isArray(item.raw.slides)?item.raw.slides.map(slide => typeof slide === "string" ? {image:slide} : slide).filter(slide => slide && slide.image):[];

    /*
    ---------------------------------------------------------
    PDF-backed slideshow
    ---------------------------------------------------------
    ContentContract intentionally exposes PDF slideshows with
    pdfUrl + an empty slides array. Render those pages directly
    with PDF.js so the Front Page can feature them without
    converting the source PDF into separate image files.
    ---------------------------------------------------------
    */

    if(!slides.length && item.raw.pdfUrl){
        let pdf=null;
        let index=1;
        let busy=false;
        let playing=false;
        let timer=null;

        const audio=setupAudio(item);

        const canvas=document.createElement("canvas");
        canvas.className="front-media-pdf";
        ui.content.appendChild(canvas);

        const prevB=control(
            "previous",
            "Previous page",
            ()=>go(-1)
        );



        const playB=control(
            "play",
            "Play slideshow",
            ()=>{
                if(!pdf || busy) return;

                playing=!playing;
                clear();

                if(playing){
                    schedule();
                    if(audio) audio.play().catch(()=>{});
                }else if(audio){
                    audio.pause();
                }

                sync();
            }
        );

        const nextB=control(
            "next",
            "Next page",
            ()=>go(1)
        );

        const muteB=control(
            "volume",
            "Mute slideshow",
            ()=>{
                if(!audio) return;
                audio.muted=!audio.muted;
                muteB.innerHTML="";
                muteB.appendChild(icon(audio.muted?"volume-off":"volume"));
                muteB.title=audio.muted?"Unmute slideshow":"Mute slideshow";
                muteB.setAttribute("aria-label",muteB.title);
            }
        );
        if(!audio){
            muteB.disabled=true;
            muteB.innerHTML="";
            muteB.appendChild(icon("volume-off"));
        }

        ui.controlsLeft.append(muteB);
        ui.controlsCenter.append(prevB,playB,nextB);
        addOpenControl(ui.controlsRight,item);



        function clear(){
            if(timer){
                clearTimeout(timer);
                timer=null;
            }
        }

        function update(){
            if(!pdf){
                ui.status.textContent="Loading…";
                prevB.disabled=true;
                nextB.disabled=true;
                return;
            }

            ui.status.textContent=`${index} / ${pdf.numPages}`;
            prevB.disabled=index<=1;
            nextB.disabled=index>=pdf.numPages;
        }

        function schedule(){
            clear();

            if(!playing || !pdf) return;

            timer=setTimeout(()=>{
                if(index < pdf.numPages){
                    index++;
                    draw().then(schedule).catch(error=>{
                        console.error(
                            "[FrontMediaRenderer] PDF slideshow advance failed.",
                            error
                        );
                        playing=false;
                        sync();
                    });
                }else{
                    index=1;
                    draw().then(schedule).catch(error=>{
                        console.error(
                            "[FrontMediaRenderer] PDF slideshow loop failed.",
                            error
                        );
                        playing=false;
                        sync();
                    });
                }
            },5000);
        }

        async function draw(){
            if(!pdf || token!==generation) return;

            busy=true;
            update();

            try{
                const page=await pdf.getPage(index);

                const base=page.getViewport({scale:1});

                const maxW=Math.max(
                    80,
                    ui.content.clientWidth-20
                );

                const maxH=Math.max(
                    80,
                    ui.content.clientHeight-20
                );

                const scale=Math.min(
                    maxW/base.width,
                    maxH/base.height
                );

                const viewport=page.getViewport({
                    scale:Math.max(.1,scale)
                });

                canvas.width=Math.ceil(viewport.width);
                canvas.height=Math.ceil(viewport.height);

                canvas.classList.remove("is-entering");
                void canvas.offsetWidth;

                await page.render({
                    canvasContext:canvas.getContext(
                        "2d",
                        {alpha:false}
                    ),
                    viewport
                }).promise;

                if(token===generation){
                    canvas.classList.add("is-entering");
                    update();
                }
            }finally{
                busy=false;
            }
        }

        async function go(delta){
            if(!pdf || busy) return;

            const target=Math.max(
                1,
                Math.min(
                    pdf.numPages,
                    index+delta
                )
            );

            if(target===index) return;

            clear();
            playing=false;
            if(audio) audio.pause();
            index=target;

            sync();
            await draw();
        }

        function sync(){
            playB.innerHTML="";
            playB.appendChild(
                icon(playing?"pause":"play")
            );

            playB.title=playing
                ?"Pause slideshow"
                :"Play slideshow";

            playB.setAttribute(
                "aria-label",
                playB.title
            );
        }

        try{
            if(!window.pdfjsLib){
                throw new Error("PDF.js unavailable");
            }

            pdf=await pdfjsLib.getDocument({
                url:item.raw.pdfUrl
            }).promise;

            if(token!==generation) return;

            index=1;

            await draw();
            sync();
            update();

            if(playing) schedule();

        }catch(error){
            console.error(
                "[FrontMediaRenderer] PDF slideshow preview failed.",
                error
            );

            ui.content.innerHTML="";

            const img=document.createElement("img");
            img.className="front-media-fallback";
            img.src=
                item.thumbnail ||
                "assets/default-thumbnail.png";
            img.alt=item.title||"";

            ui.content.appendChild(img);
            ui.status.textContent=
                "PDF preview unavailable";
        }

        cleanupFn=()=>{
            clear();
            pdf=null;
            if(audio){
                audio.pause();
                audio.currentTime=0;
            }
        };

        return;
    }

    /*
    ---------------------------------------------------------
    Normal image slideshow
    ---------------------------------------------------------
    */

    let index=0;
    let playing=false;
    let timer=null;

    const audio=setupAudio(item);

    const img=document.createElement("img");
    img.className="front-media-slide";
    img.alt=item.title||"";
    img.draggable=false;

    ui.content.appendChild(img);

    function clear(){
        if(timer){
            clearTimeout(timer);
            timer=null;
        }
    }

    function show(){
        if(token!==generation) return;

        const s=slides[index];

        if(!s) return;

        img.classList.remove("is-entering");
        void img.offsetWidth;

        img.src=s.image||"";
        img.alt=s.title||item.title||"";
        img.classList.add("is-entering");

        ui.status.textContent=
            `${index+1} / ${slides.length}`;

        if(playing){
            timer=setTimeout(
                next,
                Math.max(
                    1,
                    Number(s.duration)||5
                )*1000
            );
        }
    }

    function next(){
        clear();

        if(!slides.length) return;

        if(index < slides.length-1){
            index++;
        }else{
            index=0;
        }

        show();
        sync();
    }

    function prev(){
        clear();

        if(index>0){
            index--;
            show();
        }

        playing=false;
        if(audio) audio.pause();
        sync();
    }

    let touchStartX=0;
    let touchStartY=0;

    ui.content.addEventListener(
        "touchstart",
        event=>{
            if(event.touches.length!==1) return;

            touchStartX=
                event.touches[0].clientX;

            touchStartY=
                event.touches[0].clientY;
        },
        {passive:true}
    );

    ui.content.addEventListener(
        "touchend",
        event=>{
            if(event.changedTouches.length!==1) return;

            const touch=event.changedTouches[0];

            const deltaX=
                touch.clientX-touchStartX;

            const deltaY=
                touch.clientY-touchStartY;

            if(Math.abs(deltaX)<=Math.abs(deltaY)){
                return;
            }

            if(Math.abs(deltaX)<40){
                return;
            }

            if(deltaX<0){
                next();
            }else{
                prev();
            }
        },
        {passive:true}
    );

    const prevB=control(
        "previous",
        "Previous slide",
        prev
    );



    const playB=control(
        "play",
        "Play slideshow",
        ()=>{
            playing=!playing;
            clear();

            if(playing){
                show();
                if(audio) audio.play().catch(()=>{});
            }else if(audio){
                audio.pause();
            }

            sync();
        }
    );

    const nextB=control(
        "next",
        "Next slide",
        next
    );

    const muteB=control(
        "volume",
        "Mute slideshow",
        ()=>{
            if(!audio) return;
            audio.muted=!audio.muted;
            muteB.innerHTML="";
            muteB.appendChild(icon(audio.muted?"volume-off":"volume"));
            muteB.title=audio.muted?"Unmute slideshow":"Mute slideshow";
            muteB.setAttribute("aria-label",muteB.title);
        }
    );
    if(!audio){
        muteB.disabled=true;
        muteB.innerHTML="";
        muteB.appendChild(icon("volume-off"));
    }

    ui.controlsLeft.append(muteB);

    ui.controlsCenter.append(
        prevB,
        playB,
        nextB
    );

    addOpenControl(
        ui.controlsRight,
        item
    );

    
    function sync(){
        playB.innerHTML="";

        playB.appendChild(
            icon(
                playing
                    ?"pause"
                    :"play"
            )
        );

        playB.title=playing
            ?"Pause slideshow"
            :"Play slideshow";

        playB.setAttribute(
            "aria-label",
            playB.title
        );
    }

    show();
    sync();

    cleanupFn=()=>{
        clear();
        if(audio){
            audio.pause();
            audio.currentTime=0;
        }
    };
}


    async function renderPdf(item,token){
        const ui=shell(item,"reader");
        const canvas=document.createElement("canvas"); canvas.className="front-media-pdf"; ui.content.appendChild(canvas);
        const prev=control("previous","Previous page",()=>go(-1)); const next=control("next","Next page",()=>go(1));
        ui.controlsCenter.append(prev,next); addOpenControl(ui.controlsRight,item);
        let pdf=null,page=1,busy=false;
        function update(){ui.status.textContent=pdf?`${page} / ${pdf.numPages}`:"Loading…";prev.disabled=!pdf||page<=1;next.disabled=!pdf||page>=pdf.numPages;}
        async function draw(){if(!pdf||token!==generation)return; busy=true;update(); const p=await pdf.getPage(page); const base=p.getViewport({scale:1}); const maxW=Math.max(80,ui.content.clientWidth-20),maxH=Math.max(80,ui.content.clientHeight-20); const scale=Math.min(maxW/base.width,maxH/base.height); const vp=p.getViewport({scale:Math.max(.1,scale)}); canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);canvas.classList.remove("is-entering");void canvas.offsetWidth; await p.render({canvasContext:canvas.getContext("2d",{alpha:false}),viewport:vp}).promise;canvas.classList.add("is-entering");busy=false;update();}
        async function go(delta){if(!pdf||busy)return;const target=Math.max(1,Math.min(pdf.numPages,page+delta));if(target===page)return;page=target;await draw();}
        try{
            if(!window.pdfjsLib)throw new Error("PDF.js unavailable");
            const url=item.raw.pdf||item.raw.media||item.raw.url||item.raw.PDF||""; if(!url)throw new Error("PDF URL missing");
            pdf=await pdfjsLib.getDocument({url}).promise; if(token!==generation)return; await draw();
        }catch(e){console.error("[FrontMediaRenderer] PDF preview failed",e);ui.content.innerHTML="";const img=document.createElement("img");img.className="front-media-fallback";img.src=item.thumbnail||"assets/default-thumbnail.png";img.alt=item.title||"";ui.content.appendChild(img);ui.status.textContent="PDF preview unavailable";}
        cleanupFn=()=>{pdf=null;}; update();
    }

function stopPlayback(){
    if(cleanupFn){
        try{
            cleanupFn();
        }catch(error){
            console.warn("[FrontMediaRenderer] Playback cleanup failed.", error);
        }
        cleanupFn=null;
    }
}

    function render(item){
    generation++;

    const token=generation;

    stopPlayback();

    activeItem=item;

        if(!host)return;
        if(!item){host.innerHTML="";return;}
        if(item.section==="video")renderVideo(item,token);
        else if(item.section==="slideshow")renderSlideshow(item,token);
        else if(item.section==="reader")renderPdf(item,token);
        else {const ui=shell(item,"unknown");const img=document.createElement("img");img.className="front-media-fallback";img.src=item.thumbnail||"assets/default-thumbnail.png";img.alt=item.title||"";ui.content.appendChild(img);addOpenControl(ui.controlsRight,item);}
    }
    function init(element){host=element||document.getElementById("frontMediaHost");return !!host;
    }

    function destroy(){
    generation++;

    stopPlayback();

    if(host)
        host.innerHTML="";

    activeItem=null;
    }

    return {
    init,
    render,
    destroy,
    stopPlayback,
    getCurrent:()=>activeItem
};
})();