"use strict";

window.SlideshowViewer = (function () {
    let root, stage, title, status, audio, landing, current = null, index = 0, timer = null, playing = false, muted = false, transitionBusy = false;
    let audioMode = "none";
    let audioCompleted = false;
    let musicAudio = null;
    let effectAudio = null;
    const EFFECT_URL = "assets/audio/slide.mp3";
    const EFFECT_FALLBACK_URL = "assets/audio/pageturn.mp3";
    const MUSIC_LIBRARY = [];

    function setPlaybackChrome(active){
        document.querySelectorAll(".slideshow-toolbar,.slideshow-status-bar,.slideshow-playback-status,.slideshow-viewer-title").forEach(el=>{el.hidden=!active;});
    }



    function init() {
        root = document.getElementById("slideshowViewer");
        stage = document.getElementById("slideshowStage");
        title = document.getElementById("slideshowViewerTitle");
        status = document.getElementById("slideshowStatus");
        audio = document.getElementById("slideshowAudio");
        landing = document.getElementById("slideshowLanding");
        if (!stage) return false;
        setPlaybackChrome(false);
        if (!document.documentElement.dataset.slideshowEscapeBound) {
            document.documentElement.dataset.slideshowEscapeBound = "true";
            document.addEventListener("keydown", event => {
                if (event.key !== "Escape") return;
                if (current) {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                }
            }, true);
        }
        audio?.addEventListener("ended", () => {
            if (audioMode === "original" && current?.audio) {
                audioCompleted = true;
                // Do not restart the audio. The slideshow may continue
                // through the remaining slides until it reaches the end.
                if (playing && slideCount() && index >= slideCount() - 1) finish();
            }
        });
        window.addEventListener("resize", refreshLayout);
        renderLanding();
        setAudioMode(current?.audio ? "original" : "effects");
        return true;
    }
    function renderLanding() {
        const container = document.getElementById("slideshowLandingLibrary"); if (!container) return;
        container.innerHTML = "";
        const recentContainer = document.getElementById("slideshowLandingRecent");
        if (recentContainer) recentContainer.innerHTML = "";
        const list = window.SlideshowLibrary ? SlideshowLibrary.getDisplayed() : [];
        let recentItem = null;
        try {
            const ids = JSON.parse(localStorage.getItem("skyslideshow-recent") || "[]");
            if (Array.isArray(ids) && ids.length) recentItem = list.find(x => x.id === ids[0]) || null;
        } catch (e) {}
        if (recentContainer && recentItem) {
            const b = document.createElement("button"); b.type="button"; b.className="slideshow-landing-recent-card";
            const img=document.createElement("img");

img.className = "slideshow-landing-recent-thumbnail";
img.loading = "lazy";
img.alt = recentItem.title || "";

const fallbackThumbnail = "assets/default-thumbnail.png";

img.src =
    recentItem.thumbnail ||
    recentItem.slides?.[0]?.image ||
    fallbackThumbnail;

img.addEventListener("error", () => {

    if (img.dataset.fallbackApplied === "true") {
        return;
    }

    img.dataset.fallbackApplied = "true";
    img.src = fallbackThumbnail;

});
            const info=document.createElement("div"); info.className="slideshow-landing-recent-info";
            const title=document.createElement("div"); title.className="slideshow-landing-recent-title"; title.textContent=recentItem.title||"";
            const subtitle=document.createElement("div"); subtitle.className="slideshow-landing-recent-subtitle"; subtitle.textContent="Last viewed";
            info.append(title,subtitle);
            b.append(img,info);
            b.addEventListener("click",()=>open(recentItem)); recentContainer.appendChild(b);
        }
        list.forEach(item => {
            const b = document.createElement("button"); b.type="button"; b.className="slideshow-landing-card";
            const img = document.createElement("img");

img.className = "slideshow-landing-card-thumbnail";
img.loading = "lazy";
img.alt = item.title || "";

const fallbackThumbnail = "assets/default-thumbnail.png";

img.src =
    item.thumbnail ||
    item.slides?.[0]?.image ||
    fallbackThumbnail;

img.addEventListener("error", () => {

    if (img.dataset.fallbackApplied === "true") {
        return;
    }

    img.dataset.fallbackApplied = "true";
    img.src = fallbackThumbnail;

});
            const s=document.createElement("span"); s.className="slideshow-landing-card-title"; s.textContent=item.title;
            b.append(img,s);
            b.addEventListener("click",()=>open(item)); container.appendChild(b);
        });
    }
    function slideCount(){
        if(!current) return 0;
        if(current.source === "pdf" || current.pdfUrl) {
            return Number(current.pdfPageCount || current.slideCount || 0);
        }
        return Array.isArray(current.slides) ? current.slides.length : 0;
    }

    function updateStatus(){
        if(status) {
            const total=slideCount();
            status.textContent=current && total ? `${index+1} / ${total}` : "";
        }
    }
    function setStatus(message){
        const el=document.getElementById("slideshowPlaybackStatus");
        if(el) el.textContent=message||"";
    }
    function updateTitle(){ if(title) title.textContent=current?current.title||"":""; }
    function stopTimer(){ if(timer){clearTimeout(timer);timer=null;} }
    function schedule(){
        stopTimer();
        if(!playing||!current)return;

        const slide = current.slides?.[index];
        const duration = Math.max(1, Number(slide?.duration) || 5);

        timer=setTimeout(()=>next(true),duration*1000);
    }
    function buildImageSlide(slide){
        const el=document.createElement("div");
        el.className="slideshow-slide";

        const img=document.createElement("img");
        img.src=slide.image;
        img.alt=slide.title||current?.title||"";
        img.draggable=false;
        el.appendChild(img);

        if(slide.caption){
            const cap=document.createElement("div");
            cap.className="slideshow-caption";
            cap.textContent=slide.caption;
            el.appendChild(cap);
        }

        return {element:el,ready:Promise.resolve(img)};
    }

    async function buildPdfSlide(pageNumber){
        const el=document.createElement("div");
        el.className="slideshow-slide";

        const canvas=document.createElement("canvas");
        canvas.setAttribute("aria-label", current?.title || "Slide");
        canvas.style.maxWidth="100%";
        canvas.style.maxHeight="100%";
        canvas.style.width="auto";
        canvas.style.height="auto";
        el.appendChild(canvas);

        if(!current?.pdfDocument){
            throw new Error("PDF slide show is not loaded.");
        }

        const page=await current.pdfDocument.getPage(pageNumber);
        const baseViewport=page.getViewport({scale:1});

        const maxWidth=Math.max(320,stage?.clientWidth||1200);
        const maxHeight=Math.max(220,stage?.clientHeight||700);
        const scale=Math.min(
            maxWidth/baseViewport.width,
            maxHeight/baseViewport.height
        );

        const viewport=page.getViewport({scale:Math.max(0.1,scale)});
        const dpr=window.devicePixelRatio||1;

        canvas.width=Math.ceil(viewport.width*dpr);
        canvas.height=Math.ceil(viewport.height*dpr);

        const context=canvas.getContext("2d",{alpha:false});
        context.setTransform(dpr,0,0,dpr,0,0);

        await page.render({
            canvasContext:context,
            viewport
        }).promise;

        return {element:el,ready:Promise.resolve(canvas)};
    }

    async function buildSlide(slideIndex){
        if(current?.source==="pdf" || current?.pdfUrl){
            return buildPdfSlide(slideIndex+1);
        }

        return buildImageSlide(current.slides[slideIndex]);
    }

function playSound(src, volume=1){

    if(muted || !src) {
        return;
    }

    /*
    -------------------------------------------------------
     Page-turn effects are also media.

     Stop any previous effect first.
    -------------------------------------------------------
    */

    if(effectAudio){
        effectAudio.pause();
        effectAudio.currentTime = 0;
        effectAudio = null;
    }

    effectAudio = new Audio(src);
    effectAudio.volume = volume;

    effectAudio.play().catch(() => {

        if(src !== EFFECT_FALLBACK_URL){

            if(effectAudio){
                effectAudio.pause();
            }

            effectAudio = new Audio(
                EFFECT_FALLBACK_URL
            );

            effectAudio.volume = volume;

            effectAudio.play().catch(() => {});

        }

    });

}

    function stopAudio(){

    audio?.pause();

    if(audio){
        audio.removeAttribute("src");
        audio.load();
    }

    musicAudio?.pause();

    if(effectAudio){
        effectAudio.pause();
        effectAudio.currentTime = 0;
        effectAudio = null;
    }

}

function stopAllMedia() {

    playing = false;

    stopTimer();

    stopAudio();

}


function stopForMediaManager() {

    playing = false;
    stopTimer();
    stopAudio();

    if (
        current?.pdfDocument &&
        typeof current.pdfDocument.destroy === "function"
    ) {
        try {
            current.pdfDocument.destroy();
        } catch (e) {}
    }

    if (stage) {
        stage.innerHTML = "";
    }

    if (root) {
        root.classList.remove("has-slideshow");
    }

    setPlaybackChrome(false);

    current = null;
    index = 0;

    updateTitle();
    updateStatus();

    if (landing) {
        landing.classList.remove("hidden");
    }

    renderLanding();
}


    function startSelectedAudio(){
        stopAudio();
        audioCompleted=false;
        if(!current)return;
        if(audioMode === "original" && current.audio && audio){ audio.src=current.audio; audio.muted=muted; audio.load(); if(playing)audio.play().catch(()=>{}); }
        else if(audioMode === "music" && MUSIC_LIBRARY.length){
            const track=MUSIC_LIBRARY[0];
            musicAudio=new Audio(track.url);
            musicAudio.loop=false;
            musicAudio.muted=muted;
            musicAudio.addEventListener("ended",()=>{
                audioCompleted=true;
                if(playing && slideCount() && index >= slideCount() - 1) finish();
            });
            if(playing)musicAudio.play().catch(()=>{});
        }
    }
    function setAudioMode(mode){
        const select=document.getElementById("slideshowAudioMode");
        const requested=["none","original","effects","music"].includes(mode)?mode:"none";
        if(requested==="original" && !current?.audio) audioMode="none"; else audioMode=requested;
        if(select) select.value=audioMode;
        if(select){ const original=select.querySelector('option[value="original"]'); if(original) original.disabled=!current?.audio; const music=select.querySelector('option[value="music"]'); if(music) music.disabled=!MUSIC_LIBRARY.length; }
        startSelectedAudio();
        setStatus(audioMode==="original"?"Original sound":audioMode==="music"?"Music":audioMode==="effects"?"Page turn effects":"No sound");
    }
    async function show(indexToShow,direction=1,autoAdvance=false){
        if(!current||transitionBusy)return;

        const total=slideCount();
        if(!total)return;

        index=Math.max(0,Math.min(indexToShow,total-1));
        updateStatus();

        let built;

        try{
            built=await buildSlide(index);
        }catch(error){
            setStatus("Unable to render slide");
            console.error("[SlideshowViewer] Slide render failed.",error);
            return;
        }

        const old=stage.querySelector(".slideshow-slide");
        const fresh=built.element;

        const startTransition=()=>{
            stage.appendChild(fresh);
            transitionBusy=true;

            SlideshowTransitions.run({
                stage,
                oldSlide:old,
                newSlide:fresh,
                direction,
                done:()=>{
                    transitionBusy=false;
                    schedule();
                }
            });
        };

        if(built.ready){
            try{ await built.ready; }catch(e){}
        }

        startTransition();

        // Do not finish merely because the slideshow reached the last slide.
        // next() owns end-of-sequence behavior so an active original/music
        // track can cause the sequence to wrap back to slide 1 and continue
        // until that audio naturally ends.
    }

    function next(fromTimer=false){
        if(!current)return;
        const total=slideCount();
        if(!total)return;

        if(index<total-1){
            if(audioMode==="effects") playSound(EFFECT_URL);
            show(index+1,1,fromTimer);
            return;
        }

        // While selected original/music audio is still playing, repeat the
        // slide sequence. Once that audio has actually ended, continue only
        // forward to the final slide and finish there.
        const audioIsDrivingPlayback =
            (audioMode === "original" || audioMode === "music") &&
            !audioCompleted;

        if(audioIsDrivingPlayback){
            if(audioMode==="effects") playSound(EFFECT_URL);
            show(0,1,fromTimer);
        }else if(playing){
            finish();
        }
    }
    function previous(){if(!current)return;if(index>0){playing=false;show(index-1,-1);setStatus("Paused");}}
    function togglePlay(){
        if(!current)return; playing=!playing;
        if(playing){setStatus("Playing");schedule();startSelectedAudio();}
        else{setStatus("Paused");stopTimer();audio?.pause();musicAudio?.pause();}
    }

function restart(){
    if(!current) return;

    console.log("[SlideshowViewer] Restart requested.");

    // Stop the current playback cycle.
    playing = false;
    stopTimer();
    stopAudio();

    // Reset slideshow position.
    index = 0;

    // Clear any transition lock so Restart cannot be blocked
    // by a previous slide transition.
    transitionBusy = false;

    // Remove the currently displayed slide.
    if(stage){
        stage.innerHTML = "";
    }

    // Start again from slide 1.
    playing = true;
    setStatus("Playing");
    updateStatus();

    // Restart the selected audio mode.
    startSelectedAudio();

    // Render slide 1.
    show(0, 1, false);

    // Restore the Play button to its Pause state.
    const playButton = document.getElementById("slideshowPlay");

    if(playButton){
        playButton.title = "Pause slide show";
        playButton.setAttribute("aria-label","Pause slide show");

        const use = playButton.querySelector("use");

        if(use){
            use.setAttribute("href","#icon-pause");
        }
    }
}

    function toggleMute(){
    muted = !muted;

    if (audio) {
        audio.muted = muted;

        if (!muted && playing && audio.src) {
            audio.play().catch(() => {});
        }
    }

    if (musicAudio) {
        musicAudio.muted = muted;

        if (!muted && playing && musicAudio.src) {
            musicAudio.play().catch(() => {});
        }
    }

    return muted;
}

function finish(){
    playing=false;
    stopTimer();
    audio?.pause();
    musicAudio?.pause();
    setStatus("Finished");

    const el=document.getElementById("slideshowPlay");
    if(el){
        el.title="Play slide show";
        el.setAttribute("aria-label","Play slide show");

        const use=el.querySelector("use");
        if(use)use.setAttribute("href","#icon-play");
    }
}

    function close(){
        if(document.fullscreenElement && document.fullscreenElement===root){
            document.exitFullscreen?.();
        }
stopAllMedia();

if (
    window.MediaManager &&
    typeof MediaManager.release === "function"
) {
    MediaManager.release("slideshow");
}

        if(current?.pdfDocument && typeof current.pdfDocument.destroy==="function"){
            try{ current.pdfDocument.destroy(); }catch(e){}
        }
        if(stage)stage.innerHTML="";
        if(root)root.classList.remove("has-slideshow");
        setPlaybackChrome(false);
        if(landing){
            landing.classList.add("hidden");
            window.setTimeout(()=>{
                if(!landing || root?.classList.contains("has-slideshow")) return;
                landing.classList.remove("hidden");
            },1000);
        }
        current=null;
        index=0;
        updateTitle();
        updateStatus();
        setAudioMode("none");
    }
    function refreshLayout(){ if(!root||!stage)return; }
    function toggleFullscreen(){if(!root)return;if(document.fullscreenElement)document.exitFullscreen?.();else root.requestFullscreen?.().catch(()=>{});}

async function open(item) {

    if (!item) return;

/*
-------------------------------------------------------
 Claim global media ownership BEFORE assigning the new
 slideshow to `current`. MediaManager.claim() stops the
 previous owner first. Doing this after `current = item`
 would allow the cleanup callback to erase the new item.
-------------------------------------------------------
*/

if (
    window.MediaManager &&
    typeof MediaManager.claim === "function"
) {

    MediaManager.claim(
        "slideshow",
        stopForMediaManager
    );

}

    current = item;
    index = 0;
    playing = true;
    stopTimer();

    // existing PDF/image opening code continues...

        /*
         * PDF slide shows are opened lazily. PDF.js gives us the authoritative
         * page count; any supplied slideCount is retained as declaredSlideCount
         * and then corrected in memory.
         */
        if(item.source==="pdf" || item.pdfUrl){
            if(typeof pdfjsLib==="undefined"){
                setStatus("PDF support is unavailable");
                current=null;
                return;
            }

            try{
                const task=pdfjsLib.getDocument({
                    url:item.pdfUrl,
                    enableXfa:false,
                    useSystemFonts:true
                });

                current.pdfDocument=await task.promise;
                current.pdfPageCount=current.pdfDocument.numPages;

                if(window.Manifest &&
                   typeof Manifest.reconcileSlideshowCount==="function"){
                    Manifest.reconcileSlideshowCount(
                        current,
                        current.pdfPageCount
                    );
                }else{
                    current.slideCount=current.pdfPageCount;
                }
            }catch(error){
                console.error("[SlideshowViewer] Unable to open PDF slideshow.",error);
                setStatus("Unable to open PDF slide show");
                current=null;
                return;
            }
        }

        const total=slideCount();
        if(!total){
            current=null;
            return;
        }

        root.classList.add("has-slideshow");
        setPlaybackChrome(true);
        landing?.classList.add("hidden");

        stage.innerHTML="";
        updateTitle();
        updateStatus();

        setAudioMode(item.audio ? "original" : "none");

        await show(0);

        try{
            const key="skyslideshow-recent";
            const ids=JSON.parse(localStorage.getItem(key)||"[]");
            const nextIds=[
                item.id,
                ...(Array.isArray(ids)?ids:[]).filter(id=>id!==item.id)
            ].slice(0,10);

            localStorage.setItem(key,JSON.stringify(nextIds));
        }catch(e){}

        renderLanding();
        refreshLayout();
    }




return {
    init,
    open,
    next,
    previous,
    togglePlay,
    restart,
    toggleMute,
    close,
    toggleFullscreen,
    renderLanding,
    setTransition:name=>SlideshowTransitions.set(name),
    setAudioMode,
    getCurrent:()=>current,
    getMusicLibrary:()=>[...MUSIC_LIBRARY],
    isPlaying:()=>playing,
    isMuted:()=>muted
};


})();    
