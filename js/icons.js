"use strict";

window.IconManager={

set(buttonId,iconId){

const button=document.getElementById(buttonId);

if(!button)return;

const use=button.querySelector("use");

if(use){

use.setAttribute("href","#"+iconId);

}

},

setMute(muted){

this.set(

"muteButton",

muted?

"icon-muted":

"icon-volume"

);

},

toggleShelfButtons(shelf){

SkyReader.selectors.shelfViewButton
.classList.toggle("active",shelf);

SkyReader.selectors.listViewButton
.classList.toggle("active",!shelf);

},

flash(buttonId){

const button=document.getElementById(buttonId);

if(!button)return;

button.classList.add("flash");

setTimeout(()=>{

button.classList.remove("flash");

},180);

},

disable(buttonId){

const button=document.getElementById(buttonId);

if(button){

button.disabled=true;

}

},

enable(buttonId){

const button=document.getElementById(buttonId);

if(button){

button.disabled=false;

}

},

updateNavigation(){

const previous=document.getElementById("previousButton");
if(previous){
    const atFirst=Number(SkyReader.currentPage||1)<=1;
    previous.classList.toggle("isFirstPage",atFirst);
    previous.setAttribute("aria-hidden",atFirst?"true":"false");
}

this.disable("previousButton");

this.disable("nextButton");

if(SkyReader.currentPage>0){

this.enable("previousButton");

}

if(SkyReader.currentPage<

SkyReader.pageCount-1){

this.enable("nextButton");

}

},

bookmark:`

<svg
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round">

<path d="M6 3h12v18l-6-4-6 4z"/>

</svg>

`,

};