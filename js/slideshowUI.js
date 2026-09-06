"use strict";

window.SlideshowUI=(function(){
    let initialized=false;
    function init(){
        if(initialized)return true; initialized=true;
        const bind=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener("click",fn);};
        bind("slideshowPrevious",()=>SlideshowViewer.previous());
        bind("slideshowNext",()=>SlideshowViewer.next());
        bind("slideshowPlay",()=>{SlideshowViewer.togglePlay();updatePlay();});
        bind("slideshowRestart",()=>SlideshowViewer.restart());
        bind("slideshowMute",()=>{const m=SlideshowViewer.toggleMute();const el=document.getElementById("slideshowMute");if(el){el.title=m?"Unmute audio":"Mute audio";el.setAttribute("aria-label",m?"Unmute audio":"Mute audio");const use=el.querySelector("use");if(use)use.setAttribute("href",m?"#icon-volume-off":"#icon-volume");}});
        bind("slideshowShare",()=>{const item=SlideshowViewer.getCurrent?.(); if(item&&window.ShareManager)ShareManager.share("slideshow",item);});
        bind("slideshowFullscreen",()=>SlideshowViewer.toggleFullscreen());
        bind("slideshowClose",()=>SlideshowViewer.close());
        bind("slideshowNarrowLibraryToggle",toggleDrawer);
        bind("slideshowLibraryDrawerClose",closeDrawer);
        document.querySelectorAll("[data-slideshow-view]").forEach(b=>b.addEventListener("click",()=>{SlideshowLibrary.setView(b.dataset.slideshowView);document.querySelectorAll("[data-slideshow-view]").forEach(x=>x.classList.toggle("active",x===b));}));
        const sort=document.getElementById("slideshowSort"),filter=document.getElementById("slideshowFilter"),cat=document.getElementById("slideshowCategory");
        sort?.addEventListener("change",()=>SlideshowLibrary.setSort(sort.value)); filter?.addEventListener("change",()=>SlideshowLibrary.setFilter(filter.value)); cat?.addEventListener("change",()=>SlideshowLibrary.setCategory(cat.value));
        document.getElementById("slideshowSortButton")?.addEventListener("click",()=>toggleMenu("slideshowSortMenu","slideshowFilterMenu"));
        document.getElementById("slideshowFilterButton")?.addEventListener("click",()=>toggleMenu("slideshowFilterMenu","slideshowSortMenu"));
        document.getElementById("slideshowAudioMode")?.addEventListener("change",e=>SlideshowViewer.setAudioMode(e.target.value));
        document.addEventListener("click",e=>{if(!e.target.closest(".slideshow-organization-controls")){document.getElementById("slideshowSortMenu")?.classList.add("hidden");document.getElementById("slideshowFilterMenu")?.classList.add("hidden");}});
        const searchGroup=document.getElementById("slideshowSearchGroup"), searchButton=document.getElementById("slideshowSearchButton"), searchBox=document.getElementById("slideshowSearchBox");
        searchButton?.addEventListener("click",()=>{const open=searchGroup?.classList.toggle("searchOpen");if(open)searchBox?.focus();else{if(searchBox)searchBox.value="";SlideshowLibrary.setSearch("");}});
        searchBox?.addEventListener("input",()=>SlideshowLibrary.setSearch(searchBox.value));
        document.getElementById("slideshowSettingsButton")?.addEventListener("click",()=>{if(typeof SettingsPanel!=="undefined")SettingsPanel.toggle();});
        populateCategories(); return true;
    }
    function populateCategories(){const select=document.getElementById("slideshowCategory");if(!select)return; SlideshowLibrary.getCategories().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;select.appendChild(o);});}
    function toggleMenu(open,close){document.getElementById(close)?.classList.add("hidden");document.getElementById(open)?.classList.toggle("hidden");}
    function toggleDrawer(){document.getElementById("slideshowSection")?.classList.toggle("slideshow-drawer-open");const b=document.getElementById("slideshowNarrowLibraryToggle");b?.setAttribute("aria-expanded",String(document.getElementById("slideshowSection")?.classList.contains("slideshow-drawer-open")));}
    function closeDrawer(){document.getElementById("slideshowSection")?.classList.remove("slideshow-drawer-open");document.getElementById("slideshowNarrowLibraryToggle")?.setAttribute("aria-expanded","false");}
    function updatePlay(){const el=document.getElementById("slideshowPlay");if(!el)return;const playing=typeof SlideshowViewer.isPlaying==="function"&&SlideshowViewer.isPlaying();el.title=playing?"Pause slide show":"Play slide show";el.setAttribute("aria-label",el.title);const use=el.querySelector("use");if(use)use.setAttribute("href",playing?"#icon-pause":"#icon-play");}
    return {init,openDrawer:toggleDrawer,closeDrawer};
})();
