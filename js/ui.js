"use strict";

/*
=========================================================
 SkyReader UI

 Responsibilities

 • Toolbar
 • Library toggle
 • Reader controls
 • Keyboard
 • Mouse
 • Touch
 • Progress display
 • Loading indicator
 • Simple animations

=========================================================
*/

window.UI=(function(){

const ui={};

/*-------------------------------------------------------
  DOM
-------------------------------------------------------*/

const dom={};

let initialized=false;

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

let controlsVisible=true;

let sidebarVisible=true;
let libraryRevealTimer=null;

let fullscreen=false;

let rotation=0;

let zoom=1;
let panX=0;
let panY=0;
let panActive=false;
let panPointerId=null;
let panLastX=0;
let panLastY=0;

let touchStartX=0;

let touchStartY=0;

let pinchDistance=0;
let pinching=false;

/*-------------------------------------------------------
  Icons
-------------------------------------------------------*/

const icons={

library:`
<svg viewBox="0 0 24 24" fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round">

<path d="M4 5h16"/>

<path d="M4 12h16"/>

<path d="M4 19h16"/>

</svg>
`,

previous:`
<svg viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round">

<polyline points="15 18 9 12 15 6"/>

</svg>
`,

next:`
<svg viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round">

<polyline points="9 18 15 12 9 6"/>

</svg>
`,

rotate:`↻`,


zoomIn:`
<svg viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2">

<circle cx="11" cy="11" r="7"/>

<line x1="11" y1="8" x2="11" y2="14"/>

<line x1="8" y1="11" x2="14" y2="11"/>

<line x1="20" y1="20" x2="16.5" y2="16.5"/>

</svg>
`,

zoomOut:`
<svg viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2">

<circle cx="11" cy="11" r="7"/>

<line x1="8" y1="11" x2="14" y2="11"/>

<line x1="20" y1="20" x2="16.5" y2="16.5"/>

</svg>
`,

mute:`
<svg viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2">

<polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/>

<path d="M19 5a9 9 0 010 14"/>

<path d="M15.5 8.5a5 5 0 010 7"/>

</svg>
`

};

/*-------------------------------------------------------
  Initialization
-------------------------------------------------------*/

ui.initialize=function(){

if(initialized){

return;

}

initialized=true;

cacheDom();
if(dom.productionErrorClose){
    dom.productionErrorClose.addEventListener("click",clearProductionError);
}

installIcons();

connectReader();

};

/*-------------------------------------------------------
  DOM Cache
-------------------------------------------------------*/

function cacheDom(){

dom.reader=

document.getElementById(

"reader"

);

dom.viewer=

document.getElementById(

"viewerArea"

);

dom.pageContainer =
document.getElementById(
"pageContainer"
);
dom.library=

document.getElementById(

"library"

);

dom.toolbar=

document.getElementById(

"toolbar"

);

dom.loading=

document.getElementById(

"loading"

);

dom.loadingText=

document.getElementById(

"loadingText"

);

dom.productionError=document.getElementById("productionError");
dom.productionErrorTitle=document.getElementById("productionErrorTitle");
dom.productionErrorText=document.getElementById("productionErrorText");
dom.productionErrorClose=document.getElementById("productionErrorClose");

dom.progress=

document.getElementById(

"progress"

);


dom.previousButton=

document.getElementById(

"previousButton"

);

dom.nextButton=

document.getElementById(

"nextButton"

);

dom.rotateButton=

document.getElementById(

"rotateButton"

);

dom.zoomInButton=

document.getElementById(

"btnZoomIn"

);

dom.zoomOutButton=

document.getElementById(

"btnZoomOut"

);

dom.muteButton=

document.getElementById(

"muteButton"

);

dom.viewerFullscreenButton = document.getElementById("viewerFullscreenButton");

dom.title=
document.getElementById("readerTitle");

dom.pageIndicator=
document.getElementById("pageIndicator");

dom.pageJump=document.getElementById("pageJump");

dom.pageJumpInput=document.getElementById("pageJumpInput");

dom.pageJumpButton=document.getElementById("pageJumpButton");

}

/*-------------------------------------------------------
  SVG Icons
-------------------------------------------------------*/

function installIcons(){


if(dom.previousButton){

dom.previousButton.innerHTML=

icons.previous;

}

if(dom.nextButton){

dom.nextButton.innerHTML=

icons.next;

}

if(dom.rotateButton){

dom.rotateButton.innerHTML=

icons.rotate;

}

if(dom.zoomInButton){

dom.zoomInButton.innerHTML=

icons.zoomIn;

}

if(dom.zoomOutButton){

dom.zoomOutButton.innerHTML=

icons.zoomOut;

}

if(dom.muteButton){

dom.muteButton.innerHTML=

icons.mute;

}

}

function updateMuteIcon(){

if(!dom.muteButton)return;

const muted=!!(window.AudioController && typeof AudioController.isMuted==="function" && AudioController.isMuted());

dom.muteButton.innerHTML=`<svg class="icon"><use href="#${muted?"icon-muted":"icon-volume"}"></use></svg>`;
dom.muteButton.classList.toggle("active",muted);
dom.muteButton.setAttribute("aria-label",muted?"Unmute":"Mute");
dom.muteButton.title=muted?"Unmute":"Mute";

}

/*-------------------------------------------------------
  Production Error Feedback
-------------------------------------------------------*/

function clearProductionError(){
    if(!dom.productionError)return;
    dom.productionError.hidden=true;
    if(dom.productionErrorText)dom.productionErrorText.textContent="";
}

function showProductionError(error,title="SkyReader could not complete that action."){
    if(!dom.productionError)return;
    const message=error instanceof Error ? error.message : String(error||"Unknown error.");
    if(dom.productionErrorTitle)dom.productionErrorTitle.textContent=title||"SkyReader could not complete that action.";
    if(dom.productionErrorText)dom.productionErrorText.textContent=message;
    dom.productionError.hidden=false;
}

ui.showError=function(error,title){ showProductionError(error,title); };
ui.clearError=function(){ clearProductionError(); };

/*-------------------------------------------------------
  Reader Events
-------------------------------------------------------*/

function connectReader(){

Reader.on(

"progress",

(percent,text)=>{

if(dom.loadingText){

 dom.loadingText.textContent=text;

 }

if(dom.progress){

dom.progress.value=percent;

}

});

Reader.on(

"ready",

(book,pages)=>{

if(dom.loadingText){

 dom.loadingText.textContent="";

 }

});

Reader.on(

"closed",

()=>{

ui.hideToolbar();

if(dom.progress){

dom.progress.value=0;

}

});

}

/*-------------------------------------------------------
  Toolbar
-------------------------------------------------------*/

function connectToolbar(){


if(dom.previousButton){

dom.previousButton.onclick=()=>{

    if(pinching)return;

    if(typeof SRNavigation!=="undefined"){
        SRNavigation.previous();
    }

};

}

if(dom.nextButton){
dom.nextButton.onclick=()=>{

    if(pinching)return;

    if(typeof SRNavigation!=="undefined"){
        SRNavigation.next();
    }

};

}

if(dom.rotateButton){

dom.rotateButton.onclick=rotateReader;

}

if(dom.zoomInButton){

dom.zoomInButton.onclick=()=>{

setZoom(zoom+0.15);

};

}

if(dom.zoomOutButton){

dom.zoomOutButton.onclick=()=>{

setZoom(zoom-0.15);

};

}

if(dom.muteButton){

dom.muteButton.onclick=()=>{

if(window.AudioController){
AudioController.toggleMute();
}

updateMuteIcon();

};

updateMuteIcon();

}
}

/*-------------------------------------------------------
  Library
-------------------------------------------------------*/

function toggleLibrary(){

sidebarVisible=!sidebarVisible;

if(!dom.library)return;

dom.library.classList.toggle(

"hidden",

!sidebarVisible

);

}

/*-------------------------------------------------------
  Zoom
-------------------------------------------------------*/

function setZoom(value){

zoom=Math.max(
1,
Math.min(4,value)
);

/*
 * Zoom and pan are coupled states.  A smaller zoom leaves less room for
 * translation, so never allow an old pan offset from a larger zoom level
 * to survive outside the new bounds.
 */
if(zoom<=1){
    zoom=1;
    panX=0;
    panY=0;
}else{
    clampPan();
}

if(dom.pageContainer){
    dom.pageContainer.style.transition="transform .15s ease";
    updateTransform();
}

}

/*-------------------------------------------------------
  Rotation
-------------------------------------------------------*/

function rotateReader(){

rotation=(rotation+90)%360;

if(dom.pageContainer){

dom.pageContainer.style.transition=

"transform .25s ease";

updateTransform();

}

}

function updateTransform(){

if(!dom.pageContainer)return;

dom.pageContainer.style.transform=

`translate3d(${panX}px,${panY}px,0) rotate(${rotation}deg) scale(${zoom})`;

dom.pageContainer.classList.toggle("skyreader-zoomed",zoom>1);
dom.pageContainer.classList.toggle("skyreader-panning",panActive);

positionReaderArrows();

}

function positionReaderArrows(){

if(!dom.toolbar || !dom.viewer)return;

const previous=dom.previousButton;
const next=dom.nextButton;
if(!previous || !next)return;

/*
 * Navigation controls belong to the viewer, not to the rendered book.
 * Keep them just inside the viewer's left/right edges at every rotation.
 * This prevents the controls from drifting into the center of a two-page
 * spread when the book is rotated 180 degrees or when the book is narrower
 * than the viewer.
 */
const viewerRect=dom.viewer.getBoundingClientRect();
const toolbarRect=dom.toolbar.getBoundingClientRect();
const gap=10;
const buttonWidth=previous.offsetWidth || 42;
const buttonHeight=previous.offsetHeight || 42;

const leftX=viewerRect.left-toolbarRect.left+gap;
const rightX=viewerRect.right-toolbarRect.left-buttonWidth-gap;
const topY=viewerRect.top-toolbarRect.top+
    Math.max(0,(viewerRect.height-buttonHeight)/2);

const centerX=viewerRect.left-toolbarRect.left + (viewerRect.width-buttonWidth)/2;
const centerY=viewerRect.top-toolbarRect.top + (viewerRect.height-buttonHeight)/2;

const place=(button,x,y,angle)=>{
    button.style.left=`${Math.round(x)}px`;
    button.style.top=`${Math.round(y)}px`;
    button.style.right="auto";
    button.style.bottom="auto";
    button.style.transform=`rotate(${angle}deg)`;
};

/* Keep the controls attached to the viewer, but rotate their positions and
   glyphs with the reader orientation. The glyphs themselves begin as: 
   previous=left, next=right. */
switch(rotation){
    case 90:
        place(previous,centerX,viewerRect.top-toolbarRect.top+gap,90);
        place(next,centerX,viewerRect.bottom-toolbarRect.top-buttonHeight-gap,90);
        break;
    case 180:
        place(previous,rightX,centerY,180);
        place(next,leftX,centerY,180);
        break;
    case 270:
        place(previous,centerX,viewerRect.bottom-toolbarRect.top-buttonHeight-gap,270);
        place(next,centerX,viewerRect.top-toolbarRect.top+gap,270);
        break;
    default:
        place(previous,leftX,topY,0);
        place(next,rightX,topY,0);
        break;
}

}


/*-------------------------------------------------------
  Page Animation
-------------------------------------------------------*/

function animatePageTurn(direction){

    /* Compatibility shim only. The UI no longer owns page-turn animation.
       All page movement belongs to SRNavigation/Sky180FlipEngine. */
    if(typeof SRNavigation==="undefined")return;

    if(direction==="next"){
        SRNavigation.next();
    }else{
        SRNavigation.previous();
    }

}

/*-------------------------------------------------------
  Public Helpers
-------------------------------------------------------*/

ui.showToolbar=function(){

/* Never expose reader controls while the viewer is in its landing/library state. */
if(typeof Reader!=="undefined" && typeof Reader.isOpen==="function" && !Reader.isOpen()){
    controlsVisible=false;
    if(dom.toolbar){
        dom.toolbar.classList.add("hidden");
    }
    return;
}

if(dom.toolbar){

dom.toolbar.classList.remove(

"hidden"

);

}

controlsVisible=true;

};

ui.hideToolbar=function(){

if(dom.toolbar){

dom.toolbar.classList.add(

"hidden"

);

}

controlsVisible=false;

};

ui.toggleToolbar=function(){

if(controlsVisible){

ui.hideToolbar();

}

else{

ui.showToolbar();

}

};

window.addEventListener("resize",()=>{

requestAnimationFrame(positionReaderArrows);

});

/*-------------------------------------------------------
  Finish Initialization
-------------------------------------------------------*/

const originalInitialize=

ui.initialize;

ui.initialize=function(){

originalInitialize();

connectToolbar();

/* The DOM cache is populated by originalInitialize(), so attach the
 * viewer-focus control only after the button actually exists.  The old
 * registration ran while this module was being evaluated, before
 * cacheDom(), leaving the button without a click handler. */
if(dom.viewerFullscreenButton){
  dom.viewerFullscreenButton.onclick=toggleViewerFocus;
  updateViewerFocusIcon(document.getElementById("app")?.classList.contains("viewerFocus"));
}

};

/*-------------------------------------------------------
  Input Controller
-------------------------------------------------------*/

function requestNavigation(direction){

if(Reader.loading()){

return;

}

if(typeof SRNavigation==="undefined")return;

if(direction==="next"){
    SRNavigation.next();
}else{
    SRNavigation.previous();
}

}

/*-------------------------------------------------------
  Keyboard
-------------------------------------------------------*/

function connectKeyboard(){

document.addEventListener(

"keydown",

event=>{

switch(event.key){

/*
 * Page navigation is owned by SRNavigation.
 * Do not call Animation.pageTurn() here.
 * This prevents a second page-turn system from competing
 * with Sky180FlipEngine/StPageFlip.
 */
case "ArrowRight":
case "PageDown":
    if(Reader.isOpen() && typeof SRNavigation!=="undefined"){
        event.preventDefault();
        SRNavigation.next();
    }
    return;

case "ArrowLeft":
case "PageUp":
    if(Reader.isOpen() && typeof SRNavigation!=="undefined"){
        event.preventDefault();
        SRNavigation.previous();
    }
    return;

case " ":
    return;

case "Home":

if(Reader.isOpen() && typeof SRNavigation!=="undefined" &&
   typeof SRNavigation.goToPage==="function"){
    event.preventDefault();
    SRNavigation.goToPage(1);
}

break;

case "End":

if(Reader.isOpen() && typeof SRNavigation!=="undefined" &&
   typeof SRNavigation.goToPage==="function"){
    event.preventDefault();
    SRNavigation.goToPage(Reader.pages());
}

break;

case "r":

case "R":

rotateReader();

break;

case "+":

case "=":

setZoom(zoom+0.15);

break;

case "-":

setZoom(zoom-0.15);

break;

}

});

}

/*-------------------------------------------------------
  Mouse Wheel
-------------------------------------------------------*/

let wheelLocked=false;

function connectWheel(){

document.addEventListener(
"wheel",
event=>{

if(!event.ctrlKey)return;

event.preventDefault();

if(event.deltaY<0)setZoom(zoom+0.1);
else setZoom(zoom-0.1);

},
{passive:false}
);

}

/*-------------------------------------------------------
  Touch
-------------------------------------------------------*/

function connectTouch(){

/* StPageFlip owns physical page swipes. */

}

/*-------------------------------------------------------
  Grab / Pan while zoomed
-------------------------------------------------------*/

function clampPan(){

if(!dom.viewer || !dom.pageContainer)return;

const viewerRect=dom.viewer.getBoundingClientRect();

/*
 * Use the page's actual untransformed layout size rather than the viewer
 * size.  This is important for responsive portrait/landscape layouts: the
 * amount of legal pan depends on the rendered book, not on the viewport.
 *
 * offsetWidth/offsetHeight are layout dimensions and therefore do not
 * include our scale/translate transform.  Rotation swaps the axes at 90/270.
 */
let baseWidth=dom.pageContainer.offsetWidth;
let baseHeight=dom.pageContainer.offsetHeight;

if(rotation%180!==0){
    const swap=baseWidth;
    baseWidth=baseHeight;
    baseHeight=swap;
}

const maxX=Math.max(0,(baseWidth*zoom-viewerRect.width)/2);
const maxY=Math.max(0,(baseHeight*zoom-viewerRect.height)/2);

panX=Math.max(-maxX,Math.min(maxX,panX));
panY=Math.max(-maxY,Math.min(maxY,panY));

}

function updatePan(){

clampPan();

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
    updateTransform();
}

}

function connectZoomPan(){

if(!dom.viewer)return;

const isControl=target=>{
    if(!target || !target.closest)return false;
    return !!target.closest(
        "button,input,textarea,select,a,#pageJump,.readerArrow,.toolbar"
    );
};

dom.viewer.addEventListener("pointerdown",event=>{

if(zoom<=1 || isControl(event.target))return;
if(event.pointerType==="touch" && event.isPrimary===false)return;

panActive=true;
panPointerId=event.pointerId;
panLastX=event.clientX;
panLastY=event.clientY;

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
    dom.pageContainer.classList.add("skyreader-panning");
}

if(dom.viewer.setPointerCapture){
    try{ dom.viewer.setPointerCapture(event.pointerId); }catch(_){}
}

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

dom.viewer.addEventListener("pointermove",event=>{

if(!panActive || event.pointerId!==panPointerId)return;

const dx=event.clientX-panLastX;
const dy=event.clientY-panLastY;

panLastX=event.clientX;
panLastY=event.clientY;

panX+=dx;
panY+=dy;

updatePan();

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

const finish=event=>{

if(!panActive)return;
if(event.pointerId!=null && event.pointerId!==panPointerId)return;

/* Prevent StPageFlip from interpreting the end of a pan as a page turn. */
if(event.preventDefault)event.preventDefault();
if(event.stopPropagation)event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

panActive=false;

if(dom.pageContainer){
    dom.pageContainer.classList.remove("skyreader-panning");
}

if(dom.viewer.releasePointerCapture && panPointerId!=null){
    try{ dom.viewer.releasePointerCapture(panPointerId); }catch(_){}
}

panPointerId=null;

};

dom.viewer.addEventListener("pointerup",finish,{passive:true,capture:true});
dom.viewer.addEventListener("pointercancel",finish,{passive:true,capture:true});
dom.viewer.addEventListener("lostpointercapture",finish,{passive:true,capture:true});

/*
 * Keep legacy touch browsers covered as well.  These handlers only
 * engage while zoomed and only for one finger, leaving the existing
 * two-finger pinch handler untouched.
 */
dom.viewer.addEventListener("touchstart",event=>{

if(zoom<=1 || event.touches.length!==1 || isControl(event.target))return;

const t=event.touches[0];

panActive=true;
panPointerId="touch";
panLastX=t.clientX;
panLastY=t.clientY;

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

dom.viewer.addEventListener("touchmove",event=>{

if(!panActive || panPointerId!=="touch" || event.touches.length!==1)return;

const t=event.touches[0];

panX+=t.clientX-panLastX;
panY+=t.clientY-panLastY;

panLastX=t.clientX;
panLastY=t.clientY;

updatePan();

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

const finishTouch=()=>{

if(panPointerId!=="touch")return;

panActive=false;
panPointerId=null;

if(dom.pageContainer){
    dom.pageContainer.classList.remove("skyreader-panning");
}

};

dom.viewer.addEventListener("touchend",finishTouch,{passive:true,capture:true});
dom.viewer.addEventListener("touchcancel",finishTouch,{passive:true,capture:true});

}

/*-------------------------------------------------------
  Pinch Zoom
-------------------------------------------------------*/

function connectPinch(){

if(!dom.viewer){

return;

}

/*
 * Pinch zoom is anchored to the midpoint between the two fingers.
 * Keeping that point stationary prevents the page from appearing to
 * "flow" toward a corner as the zoom level changes.
 */
let pinchCenterX=0;
let pinchCenterY=0;

const midpoint=(touches)=>({
    x:(touches[0].clientX+touches[1].clientX)/2,
    y:(touches[0].clientY+touches[1].clientY)/2
});

const distanceBetween=(touches)=>{
    const dx=touches[0].clientX-touches[1].clientX;
    const dy=touches[0].clientY-touches[1].clientY;
    return Math.hypot(dx,dy);
};

const setPinchZoom=(nextZoom,cx,cy)=>{

const previousZoom=zoom;

nextZoom=Math.max(1,Math.min(4,nextZoom));

if(nextZoom<=1){
    zoom=1;
    panX=0;
    panY=0;
}else{
    const rect=dom.viewer.getBoundingClientRect();

    /* Point relative to the viewer's visual center. */
    const focalX=cx-(rect.left+rect.width/2);
    const focalY=cy-(rect.top+rect.height/2);

    /*
     * Scale around the pinch midpoint.  This is the inverse of the
     * transform scaling, so the content beneath the fingers stays put.
     */
    const ratio=nextZoom/previousZoom;
    panX=focalX-(focalX-panX)*ratio;
    panY=focalY-(focalY-panY)*ratio;

    zoom=nextZoom;
    clampPan();
}

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
    updateTransform();
}

};

dom.viewer.addEventListener(
"touchstart",
event=>{

if(event.touches.length!==2){

return;

}

pinching=true;
panActive=false;
panPointerId=null;

const center=midpoint(event.touches);
pinchCenterX=center.x;
pinchCenterY=center.y;
pinchDistance=distanceBetween(event.touches);

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
}

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},

{passive:false,capture:true}
);

dom.viewer.addEventListener(
"touchmove",
event=>{

if(event.touches.length!==2 || !pinching){

return;

}

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

const distance=distanceBetween(event.touches);
const center=midpoint(event.touches);

if(pinchDistance>0){
    const factor=distance/pinchDistance;
    setPinchZoom(zoom*factor,center.x,center.y);
}

pinchDistance=distance;
pinchCenterX=center.x;
pinchCenterY=center.y;

},

{passive:false,capture:true}
);

const finishPinch=()=>{

if(!pinching)return;

pinching=false;
pinchDistance=0;

/* A final clamp guarantees a clean state after a rapid pinch-out. */
if(zoom<=1){
    zoom=1;
    panX=0;
    panY=0;
}else{
    clampPan();
}

if(dom.pageContainer){
    dom.pageContainer.style.transition="transform .15s ease";
    updateTransform();
}

};

dom.viewer.addEventListener("touchend",finishPinch,{passive:true,capture:true});
dom.viewer.addEventListener("touchcancel",finishPinch,{passive:true,capture:true});

}

/*-------------------------------------------------------
  Auto Hide Toolbar
-------------------------------------------------------*/

let toolbarTimer=null;

function resetToolbarTimer(){

if(typeof Reader!=="undefined" && typeof Reader.isOpen==="function" && !Reader.isOpen()){
    ui.hideToolbar();
    clearTimeout(toolbarTimer);
    return;
}

ui.showToolbar();

clearTimeout(

toolbarTimer

);

toolbarTimer=

setTimeout(()=>{

ui.hideToolbar();

},10000);

}

function connectToolbarAutoHide(){

["mousemove",

"touchstart",

"keydown"]

.forEach(type=>{

document.addEventListener(

type,

resetToolbarTimer,

{passive:true}

);

});

}

/*-------------------------------------------------------
  Finish Initialization
-------------------------------------------------------*/

const previousInitialize=

ui.initialize;

ui.initialize=function(){

previousInitialize();

connectKeyboard();

connectWheel();

connectTouch();

/* Zoomed-book drag/pan must be connected explicitly.
 * Responsive resizing does not constitute zoom; the zoom state is the
 * controller's own `zoom` value and is considered zoomed only when zoom > 1.
 * Without this registration the page-flip engine remains the only gesture
 * handler, so a drag is interpreted as a page turn even though the page is
 * visually scaled. */
connectZoomPan();

connectPinch();

connectToolbarAutoHide();

resetToolbarTimer();

};

/*-------------------------------------------------------
  Reader Information
-------------------------------------------------------*/

function updateReaderTitle(){

if(!dom.title)return;

const book=Reader.book();

dom.title.textContent=

book

?

book.title

:

"SkyReader";

}

function updatePageIndicator(){

if(!dom.pageIndicator)return;

if(!Reader.isOpen()){
    dom.pageIndicator.textContent="";
    return;
}

const spread=typeof Reader.spread==="function"
    ? Reader.spread()
    : {label:String(Reader.page())};

dom.pageIndicator.textContent=spread.label+" / "+Reader.pages();

if(dom.pageJumpInput){
    dom.pageJumpInput.max=String(Reader.pages());
}

}

function updateProgress(){

if(!dom.progress)return;

if(!Reader.isOpen()){

dom.progress.value=0;

return;

}

dom.progress.max=

Reader.pages();

dom.progress.value=

Reader.page();

}

/*-------------------------------------------------------
  Reader Reset
-------------------------------------------------------*/

ui.resetReaderInteractionState=function(){
    zoom=1; panX=0; panY=0; rotation=0;
    panActive=false; panPointerId=null; panLastX=0; panLastY=0;
    touchStartX=0; touchStartY=0; pinchDistance=0; pinching=false;
    if(dom.pageContainer){
        dom.pageContainer.style.transition="none";
        dom.pageContainer.style.transform="translate(0px,0px) rotate(0deg) scale(1)";
    }
};

/*-------------------------------------------------------
  Library Animation
-------------------------------------------------------*/

ui.showLibrary=function(delayReturn=false){

if(libraryRevealTimer){
    window.clearTimeout(libraryRevealTimer);
    libraryRevealTimer=null;
}

const reveal=()=>{

libraryRevealTimer=null;
sidebarVisible=true;

if(typeof SkyReader!=="undefined" &&
   typeof SkyReader.showViewerLibrary==="function"){
    /* Immediate library displays (initial load / explicit toggle) should not
       replay the return animation. Delayed book-close returns still animate. */
    SkyReader.showViewerLibrary(Boolean(delayReturn));
}

if(dom.library){

dom.library.classList.remove(

"libraryHidden"

);

}

};

if(delayReturn){
    libraryRevealTimer=window.setTimeout(reveal,1000);
}else{
    reveal();
}

};

ui.hideLibrary=function(){

if(libraryRevealTimer){
    window.clearTimeout(libraryRevealTimer);
    libraryRevealTimer=null;
}

sidebarVisible=false;

if(typeof SkyReader!=="undefined" &&
   typeof SkyReader.hideViewerLibrary==="function"){
    SkyReader.hideViewerLibrary();
}

if(dom.library){

dom.library.classList.add(

"libraryHidden"

);

}

};

ui.toggleLibrary=function(){

sidebarVisible

?

ui.hideLibrary()

:

ui.showLibrary();

};

/*-------------------------------------------------------
  Loading Indicator
-------------------------------------------------------*/

function showLoading(text){

if(!dom.loading)return;

if(dom.loadingText){
    dom.loadingText.textContent=text||"Loading...";
}
else{
    dom.loading.setAttribute("aria-label",text||"Loading...");
}

dom.loading.setAttribute("aria-busy","true");
dom.loading.classList.add("visible");

}

function hideLoading(){

if(!dom.loading)return;

dom.loading.setAttribute("aria-busy","false");
dom.loading.classList.remove("visible");

}

function beginBookOpen(text="Loading..."){

    // Prevent stale reader controls from remaining visible while the
    // previous book is cleared and the new book is still loading.
    ui.hideToolbar();

    clearProductionError();
    showLoading(text);

    if(libraryRevealTimer){
        window.clearTimeout(libraryRevealTimer);
        libraryRevealTimer=null;
    }

    sidebarVisible=false;

    if(typeof SkyReader!=="undefined" &&
       typeof SkyReader.hideViewerLibrary==="function"){
        SkyReader.hideViewerLibrary(true);
    }

    if(dom.library){
        dom.library.classList.add("libraryHidden");
    }

}

function connectPageJump(){

if(!dom.pageIndicator || !dom.pageJump || !dom.pageJumpInput)return;

const close=()=>{
    dom.pageJump.hidden=true;
    dom.pageJump.setAttribute("aria-hidden","true");
};

const open=()=>{
    if(!Reader.isOpen())return;
    dom.pageJump.hidden=false;
    dom.pageJump.setAttribute("aria-hidden","false");
    dom.pageJumpInput.min="1";
    dom.pageJumpInput.max=String(Reader.pages());
    dom.pageJumpInput.value=String(Reader.page());
    requestAnimationFrame(()=>{
        dom.pageJumpInput.focus();
        dom.pageJumpInput.select();
    });
};

const submit=async()=>{
    if(!Reader.isOpen())return;

    const raw=String(dom.pageJumpInput.value||"").trim();
    if(!/^\d+$/.test(raw)){
        dom.pageJumpInput.focus();
        dom.pageJumpInput.select();
        return;
    }

    const page=Math.max(1,Math.min(Reader.pages(),Number(raw)));

    /* Use the normal navigation path so desktop clicks, mobile taps,
       and direct page jumps all share the same reader guards. */
    const result=typeof SRNavigation!=="undefined" &&
        typeof SRNavigation.goToPage==="function"
        ? await SRNavigation.goToPage(page)
        : await Reader.goToPage(page);

    if(result!==false)close();
};

dom.pageIndicator.addEventListener("click",open);

dom.pageIndicator.addEventListener("keydown",event=>{
    if(event.key==="Enter" || event.key===" "){
        event.preventDefault();
        open();
    }
});

if(dom.pageJumpButton)dom.pageJumpButton.addEventListener("click",submit);

dom.pageJumpInput.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();submit();}
    if(event.key==="Escape"){event.preventDefault();close();}
});

dom.pageJumpInput.addEventListener("input",()=>{
    /* Keep the field numeric even on browsers that allow free-form input. */
    dom.pageJumpInput.value=dom.pageJumpInput.value.replace(/[^0-9]/g,"");
});

document.addEventListener("click",event=>{
    if(dom.pageJump.hidden)return;
    if(event.target===dom.pageIndicator || dom.pageJump.contains(event.target))return;
    close();
});

}

/*-------------------------------------------------------
  Reader Events
-------------------------------------------------------*/

Reader.on(

"bookOpened",

()=>{

clearProductionError();
updateReaderTitle();

updatePageIndicator();

updateProgress();

hideLoading();

ui.hideLibrary();

requestAnimationFrame(positionReaderArrows);

}

);

Reader.on(

"pageChanged",

(page,total)=>{

if(dom.previousButton){
    const atFirst=Number(page||1)<=1;
    dom.previousButton.classList.toggle("isFirstPage",atFirst);
    dom.previousButton.setAttribute("aria-hidden",atFirst?"true":"false");
}

/*
 * Use the page supplied by Reader directly.
 * Reader.pageChanged is emitted from the actual
 * Sky180FlipEngine/StPageFlip flip event, so this keeps
 * the visible indicator synchronized with the real spread.
 */

if(dom.pageIndicator){

    const spread=typeof Reader.spread==="function"
        ? Reader.spread()
        : {label:String(page)};

    dom.pageIndicator.textContent=
        spread.label+" / "+(total||Reader.pages());

}

if(dom.progress){

    dom.progress.max=total||Reader.pages();
    dom.progress.value=page;

}

});

Reader.on(

"progress",

(percent,text)=>{

showLoading(text);

}

);

Reader.on(

"error",

(error)=>{
    hideLoading();
    showProductionError(error,"Unable to open this publication.");
}

);

Reader.on(

"closed",

()=>{

ui.hideToolbar();

updateReaderTitle();

updatePageIndicator();

updateProgress();

/* Library return is owned by Reader.close() so every close route uses
   exactly one authoritative delayed return. */

}

);

function updateViewerFocusIcon(active){
if(!dom.viewerFullscreenButton)return;
const use=dom.viewerFullscreenButton.querySelector("use");
if(use)use.setAttribute("href",active?"#icon-fullscreen-exit":"#icon-fullscreen");
dom.viewerFullscreenButton.setAttribute("aria-pressed",active?"true":"false");
dom.viewerFullscreenButton.setAttribute("aria-label",active?"Restore interface":"Focus viewer");
dom.viewerFullscreenButton.title=active?"Restore interface":"Focus viewer";
}

function toggleViewerFocus(){
const app=document.getElementById("app");
if(!app)return;
const active=app.classList.toggle("viewerFocus");
updateViewerFocusIcon(active);
requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));
}

/*-------------------------------------------------------
  Responsive Layout
-------------------------------------------------------*/

function updateLayout(){

const mobile=

window.innerWidth<760;

document.body.classList.toggle(

"mobile",

mobile

);

document.body.classList.toggle(

"desktop",

!mobile

);

}

window.addEventListener(

"resize",

updateLayout

);

/*-------------------------------------------------------
  Fullscreen
-------------------------------------------------------*/

ui.toggleFullscreen=

async function(){

if(

!document.fullscreenElement

){

await document.documentElement

.requestFullscreen();

fullscreen=true;

}

else{

await document.exitFullscreen();

fullscreen=false;

}

};

document.addEventListener(

"fullscreenchange",

()=>{

fullscreen=

!!document.fullscreenElement;

}

);

/*-------------------------------------------------------
  Public Helpers
-------------------------------------------------------*/

ui.setTitle=function(text){

if(dom.title){

dom.title.textContent=text;

}

};

ui.beginBookOpen=function(text){

beginBookOpen(text);

};

ui.setLoading=function(text){

showLoading(text);

};

ui.clearLoading=function(){

hideLoading();

};

ui.refresh=function(){

updateReaderTitle();

updatePageIndicator();

updateProgress();

};

ui.isFullscreen=function(){

return fullscreen;

};

/*-------------------------------------------------------
  Finish Initialization
-------------------------------------------------------*/

const initializePart4=

ui.initialize;

ui.initialize=function(){

initializePart4();

connectPageJump();

updateLayout();

ui.refresh();

};

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return ui;

})();