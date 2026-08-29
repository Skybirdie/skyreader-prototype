"use strict";

/*
=========================================================
 SkyReader Renderer
 Version 3.0

 PDF.js rendering engine + page-surface manager.

 Responsibilities
 • Load PDF documents
 • Create one page surface per PDF page
 • Render PDF pages to those canvases
 • Keep a small rendering window for performance
 • Manage PDF page cache
 • Resize the viewer
 • Provide the existing Renderer navigation API
 • Render PDF hyperlinks on each page

 NOT responsible for page-turn animation.
 Sky180FlipEngine owns the presentation/transition layer.
=========================================================
*/

window.Renderer=(function(){

const renderer={};

let pdf=null;
let currentBook=null;
let currentPage=1;
let pageCount=0;
let pageRatio=1;
let renderScale=2;
let viewer=null;
let pageContainer=null;
let pageSurfaces=new Map();
let flipSurfaces=[];
let pageCache=new Map();
let renderedPages=new Set();
let renderingQueue=new Set();
let resizeObserver=null;
let currentViewport=null;
let renderGeneration=0;
let initialized=false;

/* Monotonic presentation token used to reject stale asynchronous opens. */
let presentationToken=0;
let openToken=0;

const RENDER_WINDOW=6;

renderer.events={
    progress:null,
    ready:null,
    page:null,
    error:null,
    state:null
};

function emit(name,...args){
    const fn=renderer.events[name];
    if(typeof fn==="function") fn(...args);
}

function progress(percent,text){
    emit("progress",percent,text);
}

async function resolvePdfUrl(value){
    const raw=String(value||"").trim();
    if(!raw) throw new Error("Book is missing a PDF URL.");

    /* Absolute/data/blob URLs are already complete and must be preserved. */
    if(/^(?:https?:|data:|blob:)/i.test(raw)) return raw;

    const primary=new URL(raw,window.location.href).href;

    /* Preserve the contract exactly when it resolves to a real resource. */
    try{
        const response=await fetch(primary,{method:"HEAD",cache:"no-store"});
        if(response.ok) return primary;
    }catch(error){
        /* Some servers reject HEAD. PDF.js will get the authoritative result. */
    }

    /* A bare filename is commonly supplied by Glide. If the project has its
       PDFs under /pdf/, try that conventional location before failing. */
    if(!raw.includes("/") && !raw.includes("\\")){
        const fallback=new URL("pdf/"+encodeURIComponent(raw),window.location.href).href;
        try{
            const response=await fetch(fallback,{method:"HEAD",cache:"no-store"});
            if(response.ok) return fallback;
        }catch(error){}
    }

    return primary;
}

/*-------------------------------------------------------
 Initialization
-------------------------------------------------------*/

renderer.initialize=function(){
    if(initialized) return;

    viewer=document.getElementById("viewerArea");
    pageContainer=document.getElementById("pageContainer");

    if(!viewer) throw new Error("viewerArea not found.");
    if(!pageContainer) throw new Error("pageContainer not found.");

    resizeObserver=new ResizeObserver(()=>{
        renderer.resize();
    });

    resizeObserver.observe(viewer);

    if(typeof Sky180FlipEngine!=="undefined"){
        Sky180FlipEngine.initialize({container:pageContainer});

        Sky180FlipEngine.on("page",page=>{
            currentPage=page;
            renderer.ensureRenderWindow(page);
            emit("page",currentPage,pageCount);
        });

Sky180FlipEngine.on("state",state=>{
    emit("state",state);
});

        Sky180FlipEngine.on("orientation",()=>{
            renderer.resize();
        });

        Sky180FlipEngine.on("error",error=>{
            emit("error",error);
        });
    }
    else{
        throw new Error("Sky180FlipEngine is not loaded.");
    }

    initialized=true;
};

/*-------------------------------------------------------
 Public information
-------------------------------------------------------*/

renderer.page=()=>currentPage;
renderer.pages=()=>pageCount;
renderer.book=()=>currentBook;
renderer.loaded=()=>pdf!==null;
renderer.spread=function(){
    if(typeof Sky180FlipEngine!=="undefined" && typeof Sky180FlipEngine.spread==="function"){
        return Sky180FlipEngine.spread();
    }

    if(isSinglePageDevice()){
        return {start:currentPage,end:currentPage,isCover:currentPage===1,label:String(currentPage)};
    }

    const start=currentPage===1 ? 1 : (currentPage%2===0 ? currentPage : currentPage-1);
    const end=Math.min(pageCount,start===1 ? 1 : start+1);
    return {start,end,isCover:start===1,label:start===end?String(start):start+"–"+end};
};

/*-------------------------------------------------------
 Page surfaces
-------------------------------------------------------*/

function createPageSurface(pageNumber){
    const surface=document.createElement("div");
    surface.className="sky180Page";
    surface.dataset.page=String(pageNumber);
    surface.dataset.density="soft";
    surface.setAttribute("aria-label","Page "+pageNumber);

    const canvas=document.createElement("canvas");
    canvas.className="pageCanvas";
    canvas.dataset.page=String(pageNumber);

    const ctx=canvas.getContext("2d",{
        alpha:false,
        desynchronized:true
    });

    surface.appendChild(canvas);

    /* A clean direct click/tap on the final real PDF page closes the book.
       PDF hyperlinks remain exempt so their normal link behavior is preserved. */
    let pointerStart=null;
    surface.addEventListener("pointerdown",event=>{
        pointerStart={x:event.clientX,y:event.clientY};
    },{passive:true});
    surface.addEventListener("pointerup",event=>{
        if(!pointerStart) return;
        const dx=event.clientX-pointerStart.x;
        const dy=event.clientY-pointerStart.y;
        pointerStart=null;
        if(Math.hypot(dx,dy)>8) return;
        if(Number(pageNumber)!==Number(pageCount)) return;
        if(event.target.closest && event.target.closest(".pdfLink")) return;
        document.dispatchEvent(new CustomEvent("skyreader:last-page-click"));
    },{passive:true});

    pageSurfaces.set(pageNumber,{
        element:surface,
        canvas,
        ctx,
        rendered:false,
        rendering:false,
        viewport:null
    });

    return surface;
}

function createSyntheticPageSurface(position){
    const surface=document.createElement("div");
    surface.className="sky180Page sky180SyntheticPage";
    surface.dataset.synthetic=position;
    surface.dataset.density="soft";
    surface.setAttribute("aria-hidden","true");
    return surface;
}

function isSinglePageDevice(){
    const narrow=window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
    const coarse=window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const touch=Number(navigator.maxTouchPoints||0)>0;
    const tabletTouch=touch && window.innerWidth<=1024;
    return Boolean(narrow || (coarse && tabletTouch));
}

function createAllPageSurfaces(twoPageDocument=false){
    pageSurfaces.clear();

    const surfaces=[];

    if(isSinglePageDevice()){
        for(let page=1;page<=pageCount;page++){
            surfaces.push(createPageSurface(page));
        }

        /* StPageFlip is more reliable with at least two internal surfaces.
           A one-page PDF gets an invisible companion that can never be
           navigated to; the real PDF still remains a single-page reader. */
        if(pageCount===1){
            surfaces.push(createSyntheticPageSurface("single-page-end"));
        }
    }else if(twoPageDocument){
        /* A two-page PDF is a complete spread by itself. Do not add the
           normal cover/closing synthetic pages: StPageFlip would otherwise
           pair page 1 with the opening mask and page 2 with the closing mask,
           preventing the document from ever existing as a real 1–2 spread. */
        for(let page=1;page<=pageCount;page++){
            surfaces.push(createPageSurface(page));
        }
    }else{
        surfaces.push(createSyntheticPageSurface("opening"));

        for(let page=1;page<=pageCount;page++){
            surfaces.push(createPageSurface(page));
        }

        if(pageCount%2===0){
            surfaces.push(createSyntheticPageSurface("closing"));
        }
    }

    flipSurfaces=surfaces;
    return surfaces;
}


function getSurface(pageNumber){
    return pageSurfaces.get(pageNumber)||null;
}

/*-------------------------------------------------------
 Document loading
-------------------------------------------------------*/

renderer.open=async function(book,options={}){
    if(!book || !book.pdf) return;

    /*
     * Cold-start lifecycle: do not tear down the presentation engine when
     * there is no document currently open. The previous unconditional
     * renderer.close() caused a needless destroy/recreate cycle during the
     * first launch after a fresh load.
     *
     * When replacing an existing document, however, the normal cleanup path
     * is still used.
     */
    const hasOpenDocument = Boolean(pdf || currentBook ||
        (typeof Sky180FlipEngine!=="undefined" &&
         typeof Sky180FlipEngine.active==="function" &&
         Sky180FlipEngine.active()));

    if(hasOpenDocument){
        renderer.close();
    }else if(pageContainer){
        pageContainer.innerHTML="";
    }

    currentBook=book;
    const token=++openToken;
    const presentation=++presentationToken;

    progress(5,"Opening document");

    try{
        const pdfUrl=await resolvePdfUrl(book.pdf);
        progress(8,"Loading PDF");

        const task=pdfjsLib.getDocument({
            url:pdfUrl,
            enableXfa:false,
            useSystemFonts:true
        });

        pdf=await task.promise;

        if(token!==openToken || presentation!==presentationToken) return;

        pageCount=pdf.numPages;

        const first=await pdf.getPage(1);

        if(token!==openToken || presentation!==presentationToken) return;

        currentViewport=first.getViewport({scale:1});
        pageRatio=currentViewport.width/currentViewport.height;

        const singlePage=isSinglePageDevice();
        const twoPageDocument=(!singlePage && pageCount===2);

    const requestedStart=Math.max(
            1,
            Math.min(pageCount,Number(options.startPage)||1)
        );

        currentPage=1;

        createAllPageSurfaces(twoPageDocument);

        await Sky180FlipEngine.open({
            container:pageContainer,
            pages:flipSurfaces,
            pageCount,
            startPage:1,
            singlePage,
            twoPageDocument,
            width:currentViewport.width,
            height:currentViewport.height,
            showCover:false,
            flippingTime:650
        });

        if(token!==openToken || presentation!==presentationToken) return;

        renderer.resize();

        /*
         * Initial spread: normal desktop two-page view needs both visible pages
         * ready before the reader is released. One- and two-page PDFs use the
         * compact single-page presentation fallback; page 2 is still rendered
         * by the normal background window.
         */
        const initialPages=(singlePage || pageCount===1) ? [1] : [1,2];

        await Promise.all(
            initialPages.map(pageNumber=>renderPage(pageNumber,true,token))
        );

        if(token!==openToken) return;

        emit("ready",book,pageCount);

        /* Prepare and restore a requested/saved spread after page 1 is visible. */
        if(requestedStart>1){
            await renderPage(requestedStart,true,token);

            if(token!==openToken) return;

            Sky180FlipEngine.goTo(requestedStart);
            currentPage=Sky180FlipEngine.page();
            emit("page",currentPage,pageCount);
            scheduleWindow(currentPage,token);
        }
        else{
            scheduleWindow(1,token);
        }

    }
    catch(error){
        if(token!==openToken) return;
        emit("error",error);
        throw error;
    }
};

/*-------------------------------------------------------
 Resize
-------------------------------------------------------*/

renderer.resize=function(){
    if(!viewer || !pageRatio) return;

    /* StPageFlip owns the actual spread dimensions. */
    Sky180FlipEngine.resize();

    const host=document.getElementById("sky180FlipHost");

    if(!host) return;

    /*
     * Page geometry belongs to Sky180FlipEngine/StPageFlip. Renderer only
     * owns the PDF canvas content. Do not size page surfaces against the
     * full viewer host here; doing so makes short books extend outside the
     * actual centered book rectangle and can produce duplicate image areas.
     */
};

/*-------------------------------------------------------
 PDF page cache
-------------------------------------------------------*/

async function getPage(number){
    if(pageCache.has(number)) return pageCache.get(number);

    const page=await pdf.getPage(number);
    pageCache.set(number,page);
    return page;
}

/*-------------------------------------------------------
 Rendering window
-------------------------------------------------------*/

function getWindowPages(center){
    const pages=[];

    const start=Math.max(1,center-2);
    const end=Math.min(pageCount,start+RENDER_WINDOW-1);

    for(let page=start;page<=end;page++){
        pages.push(page);
    }

    return pages;
}

renderer.ensureRenderWindow=function(center=currentPage){
    if(!pdf) return;

    scheduleWindow(center,openToken);
};

function scheduleWindow(center,token){
    const targets=getWindowPages(center);

    let delay=0;

    for(const pageNumber of targets){
        if(renderedPages.has(pageNumber) || renderingQueue.has(pageNumber)){
            continue;
        }

        renderingQueue.add(pageNumber);

        const run=async()=>{
            try{
                await renderPage(pageNumber,false,token);
            }
            catch(error){
                if(token===openToken) console.warn("[Renderer] Page render failed",pageNumber,error);
            }
            finally{
                renderingQueue.delete(pageNumber);
            }
        };

        /* Give the visible page priority, then yield between pages. */
        setTimeout(run,delay);
        delay+=25;
    }

    trimPageCache(center);
}

/*-------------------------------------------------------
 Render one page
-------------------------------------------------------*/

async function renderPage(pageNumber,visible=false,token=openToken){
    if(!pdf || token!==openToken) return;

    const surface=getSurface(pageNumber);
    if(!surface || surface.rendered || surface.rendering) return;

    surface.rendering=true;

    try{
        if(visible){
            progress(
                Math.round((pageNumber/pageCount)*100),
                "Rendering page "+pageNumber
            );
        }

        const page=await getPage(pageNumber);

        if(token!==openToken) return;

        const viewport=page.getViewport({scale:renderScale});
        surface.viewport=viewport;

        surface.canvas.width=viewport.width;
        surface.canvas.height=viewport.height;

        const ctx=surface.ctx;

        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,surface.canvas.width,surface.canvas.height);

        await page.render({
            canvasContext:ctx,
            viewport
        }).promise;

        if(token!==openToken) return;

        surface.rendered=true;
        renderedPages.add(pageNumber);

        await renderLinks(surface,page,viewport);

        if(pageNumber===currentPage){
            currentViewport=viewport;
            renderer.resize();
        }

    }
    finally{
        surface.rendering=false;
    }
}

/*-------------------------------------------------------
 Hyperlinks
-------------------------------------------------------*/

async function renderLinks(surface,page,viewport){
    surface.element
        .querySelectorAll(".pdfLink")
        .forEach(link=>link.remove());

    const annotations=await page.getAnnotations();

    for(const annotation of annotations){
        if(annotation.subtype!=="Link") continue;

        const link=document.createElement("a");
        link.className="pdfLink";
        link.style.position="absolute";
        link.style.left=(annotation.rect[0]/viewport.width*100)+"%";
        link.style.top=((viewport.height-annotation.rect[3])/viewport.height*100)+"%";
        link.style.width=((annotation.rect[2]-annotation.rect[0])/viewport.width*100)+"%";
        link.style.height=((annotation.rect[3]-annotation.rect[1])/viewport.height*100)+"%";
        link.style.cursor="pointer";
        link.style.background="transparent";
        link.style.zIndex="20";

        if(annotation.url){
            /* External PDF links open in a separate browser tab/window.
               Keep the reader page intact while allowing the device/browser
               to decide whether the new destination becomes a tab or window. */
            link.href=annotation.url;
            link.target="_blank";
            link.rel="noopener noreferrer";
        }
        else if(annotation.dest){
            link.href="#";
            link.onclick=async event=>{
                event.preventDefault();

                const destination=await pdf.getDestination(annotation.dest);
                if(!destination) return;

                const pageIndex=await pdf.getPageIndex(destination[0]);
                renderer.goTo(pageIndex+1);
            };
        }

        surface.element.appendChild(link);
    }
}

/*-------------------------------------------------------
 Page/cache cleanup
-------------------------------------------------------*/

function trimPageCache(center){
    const keep=new Set(getWindowPages(center));

    for(const key of pageCache.keys()){
        if(!keep.has(key)) pageCache.delete(key);
    }
}

/*-------------------------------------------------------
 Navigation API
-------------------------------------------------------*/

renderer.next=function(){
    if(!pdf) return false;
    return Sky180FlipEngine.next();
};

renderer.previous=function(){
    if(!pdf) return false;
    return Sky180FlipEngine.previous();
};

renderer.goTo=async function(page){
    if(!pdf) return false;

    page=Math.max(1,Math.min(pageCount,Number(page)||1));

    /* Prepare the target page before asking the engine to move. */
    const token=openToken;

    await renderPage(page,true,token);

    if(token!==openToken || !pdf) return false;

    Sky180FlipEngine.goTo(page);
    currentPage=Sky180FlipEngine.page();
    scheduleWindow(currentPage,token);

    return true;
};

renderer.refresh=function(){
    if(!pdf) return;

    for(const item of pageSurfaces.values()){
        item.rendered=false;
    }

    renderedPages.clear();
    renderingQueue.clear();

    scheduleWindow(currentPage,openToken);
};

renderer.statistics=function(){
    return {
        book:currentBook,
        currentPage,
        pageCount,
        cachedPages:pageCache.size,
        renderedPages:renderedPages.size,
        renderScale,
        renderWindow:RENDER_WINDOW,
        spread:renderer.spread(),
        flipping:Sky180FlipEngine.busy()
    };
};

/*-------------------------------------------------------
 Cleanup
-------------------------------------------------------*/

renderer.close=function(){
    openToken++;
    presentationToken++;

    if(typeof Sky180FlipEngine!=="undefined"){
        Sky180FlipEngine.close();
    }

    pageSurfaces.clear();
    pageCache.clear();
    renderedPages.clear();
    renderingQueue.clear();

    currentBook=null;
    currentPage=1;
    pageCount=0;
    pageRatio=1;
    currentViewport=null;

    if(pageContainer){
        pageContainer.innerHTML="";
    }

    pdf=null;
};

renderer.destroy=function(){
    renderer.close();

    if(resizeObserver){
        resizeObserver.disconnect();
        resizeObserver=null;
    }

    viewer=null;
    pageContainer=null;
    initialized=false;
};

/*-------------------------------------------------------
 Events
-------------------------------------------------------*/

renderer.on=function(name,callback){
    if(Object.prototype.hasOwnProperty.call(renderer.events,name)){
        renderer.events[name]=callback;
    }
    return renderer;
};

/*-------------------------------------------------------
 Configuration
-------------------------------------------------------*/

renderer.setRenderScale=function(scale){
    scale=Math.max(1,Math.min(4,Number(scale)||2));

    if(scale===renderScale) return;

    renderScale=scale;
    renderer.refresh();
};

renderer.getRenderScale=function(){
    return renderScale;
};

renderer.version="3.1.0";

return renderer;

})();

/*-------------------------------------------------------
 Automatic initialization
-------------------------------------------------------*/

document.addEventListener("DOMContentLoaded",()=>{
    Renderer.initialize();
});
