"use strict";

window.Library={

searchText:"",

_selectHandler:null,

onSelect(handler){

    this._selectHandler =
        typeof handler === "function" ? handler : null;

},

select(book,page=null){

    if(!book)return;

    /* One centralized selection sound covers grid, list, Read Again and
       Viewer Landing selections. Only this route plays selection audio. */
    if(window.AudioController && typeof AudioController.playSelect==="function"){
        AudioController.playSelect();
    }

    if(this._selectHandler){
        return this._selectHandler(book,page);
    }

    return this.open(book.id,page);

},

getOrganization(panel="main"){
    const defaults={sort:"alphabetical",filter:"all",category:""};
    const org=SkyReader.ui.organization||(SkyReader.ui.organization={});
    return Object.assign(defaults,org[panel]||{});
},

setOrganization(panel="main",changes={}){
    const org=SkyReader.ui.organization||(SkyReader.ui.organization={});
    org[panel]=Object.assign({sort:"alphabetical",filter:"all",category:"all"},org[panel]||{},changes);
    if(panel==="main"){
        this.applyOrganization();
        // State changes must always rebuild the visible library immediately.
        this.build();
    }
},

applyOrganization(){
    const org=this.getOrganization("main");
    const organized=window.LibrarySorter
        ? LibrarySorter.organize({books:SkyReader.library,sort:org.sort,filter:org.filter,category:org.category})
        : [...SkyReader.library];
    const query=(this.searchText||"").trim().toLowerCase();
    SkyReader.filteredLibrary=!query ? organized : organized.filter(book=>{
        const haystack=[book.title,book.subtitle,book.author,book.category].map(v=>String(v||"").toLowerCase());
        return haystack.some(value=>value.includes(query));
    });
    this.syncOrganizationControls();
},

populateCategories(){
    const select=document.getElementById("libraryCategory");
    if(!select)return;
    const current=this.getOrganization("main").category||"all";
    select.innerHTML='<option value="all">All categories</option>';
    const categories=window.LibrarySorter&&LibrarySorter.categories ? LibrarySorter.categories(SkyReader.library) : [];
    categories.forEach(category=>{
        const option=document.createElement("option");
        option.value=category;
        option.textContent=category;
        select.appendChild(option);
    });
    select.value=current;
},

syncOrganizationControls(){
    const org=this.getOrganization("main");
    const sort=document.getElementById("librarySort");
    const category=document.getElementById("libraryCategory");
    if(sort)sort.value=org.sort;
    if(category)category.value=org.category||"all";
    const filterButton=document.getElementById("libraryFilterButton");
    if(filterButton){
        const active=(org.category||"all")!=="all";
        filterButton.classList.toggle("isFiltered",active);
        filterButton.setAttribute("aria-pressed",active?"true":"false");
    }
},

organizedBooks(panel="viewer"){
    const org=this.getOrganization(panel);
    if(window.LibrarySorter)return LibrarySorter.organize({books:SkyReader.library,sort:org.sort,filter:org.filter,category:org.category});
    return [...SkyReader.library];
},

build(){

this.buildShelf();

this.buildList();

this.buildViewerLibrary();

},



buildViewerLibrary(){

const shelf=document.getElementById("viewerShelfView");
if(!shelf)return;

shelf.innerHTML="";

this.organizedBooks("viewer").forEach(book=>{

const card=this.createShelfCard(book);
card.classList.add("viewerBookCard");

shelf.appendChild(card);

});

this.updateViewerContinue();

},

updateViewerContinue(){
    const wrap=document.getElementById("viewerContinue");
    if(!wrap)return;

    const book=this.getReadAgainBook();
    if(!book){
        wrap.classList.add("hidden");
        wrap.innerHTML="";
        return;
    }

    const lastPage=Math.max(1,Number(SkyReader.resume.page)||1);

    wrap.innerHTML="";

    const card=document.createElement("div");
    card.className="viewerContinueCard";
    card.title=`Read again: ${book.title}`;

    const image=document.createElement("img");
    image.src=book.thumbnail||"assets/default-thumbnail.png";
    image.alt="";
    image.addEventListener("error",()=>{
        if(image.dataset.fallbackApplied==="true"){
            image.style.display="none";
            return;
        }
        image.dataset.fallbackApplied="true";
        image.src="assets/default-thumbnail.png";
    });

    const text=document.createElement("div");
    text.className="viewerContinueText";

    const title=document.createElement("strong");
    title.textContent=`Read Again: ${book.title}`;

    const page=document.createElement("span");
    page.textContent=`Last viewed: page ${lastPage}`;

    text.append(title,page);
    card.append(image,text);
    card.onclick=()=>this.select(book,1);
    wrap.appendChild(card);
    wrap.classList.remove("hidden");
},


buildShelf(){

const shelf=

document.getElementById("shelfView");

shelf.innerHTML="";

if(!SkyReader.filteredLibrary.length){
    shelf.innerHTML='<div class="libraryEmptyState">No books match the current sort, filter, or search.</div>';
    return;
}

SkyReader.filteredLibrary.forEach(book=>{

shelf.appendChild(

this.createShelfCard(book)

);

});

},

buildList(){

const list=

document.getElementById("listView");

list.innerHTML="";

if(!SkyReader.filteredLibrary.length){
    list.innerHTML='<div class="libraryEmptyState">No books match the current sort, filter, or search.</div>';
    return;
}

SkyReader.filteredLibrary.forEach(book=>{

list.appendChild(

this.createListItem(book)

);

});

},

createShelfCard(book){

const card=document.createElement("div");

card.className="bookCard";

card.dataset.id=book.id;

/* Optional per-book card background. Leave unset for the clean default.
   Later, a manifest entry can provide cardBackground without changing the layout. */
if(book.cardBackground){
    card.style.setProperty(
        "--card-background-image",
        `url("${book.cardBackground}")`
    );
}

const thumbnail=document.createElement("div");

thumbnail.className="bookThumbnail";

const image=document.createElement("img");

image.loading="lazy";

image.src=book.thumbnail;
image.alt=book.title||"";
const fallbackThumbnail="assets/default-thumbnail.png";
image.addEventListener("error",()=>{
    if(image.dataset.fallbackApplied==="true"){
        thumbnail.classList.add("thumbnailFallback");
        return;
    }
    image.dataset.fallbackApplied="true";
    image.src=fallbackThumbnail;
});

thumbnail.appendChild(image);

const title=document.createElement("div");

title.className="bookTitle";

title.textContent=book.title;

const subtitle=document.createElement("div");

subtitle.className="bookSubtitle";

subtitle.textContent=

book.subtitle||"";

card.append(

thumbnail,

title,

subtitle

);

card.onclick=()=>{

this.select(book,1);

};

return card;

},

createListItem(book){

const item=document.createElement("div");

item.className="listItem";

item.dataset.id=book.id;

const thumbWrap=document.createElement("div");
thumbWrap.className="listThumb";

const image=document.createElement("img");
image.loading="lazy";
image.src=book.thumbnail||"assets/default-thumbnail.png";
image.alt=book.title||"";
image.addEventListener("error",()=>{
    if(image.dataset.fallbackApplied==="true"){
        image.style.display="none";
        return;
    }
    image.dataset.fallbackApplied="true";
    image.src="assets/default-thumbnail.png";
});
thumbWrap.appendChild(image);

const info=document.createElement("div");
info.className="listInfo";

const title=document.createElement("div");
title.className="listTitle";
title.textContent=book.title;

const subtitle=document.createElement("div");
subtitle.className="listSubtitle";
subtitle.textContent=book.subtitle||"";

info.append(title,subtitle);
item.append(thumbWrap,info);

item.onclick=()=>{

this.select(book,1);

};

return item;

},

filter(text){

    this.searchText=String(text||"").toLowerCase();

    this.applyOrganization();

    /* Search changes the authoritative filtered collection.
       Rebuild both visible library representations so the UI immediately
       reflects the new filtered result. */
    this.buildShelf();
    this.buildList();

},

getReadAgainBook(){
    const id=SkyReader.resume && SkyReader.resume.magazineId;
    if(!id)return null;
    return SkyReader.library.find(book=>book.id===id)||null;
},


open(id,page=null){

const book=

SkyReader.library.find(

b=>b.id===id

);

if(!book)return;

SkyReader.currentMagazine=book;

StorageManager.save();


SRNavigation.openMagazine(book,page);

},

initializeEvents(){

const search=document.getElementById("searchBox");
const searchToggle=document.getElementById("topSearchButton");

if(search){
    search.addEventListener("input",e=>{
        this.filter(e.target.value);
    });

    search.addEventListener("keydown",event=>{
        if(event.key==="Escape"){
            event.preventDefault();
            event.stopPropagation();
            search.value="";
            this.filter("");
            search.blur();
        }
    });
}

if(searchToggle && search){
    const searchGroup=document.getElementById("topSearchGroup");

    const openSearch=()=>{
        if(searchGroup)searchGroup.classList.add("searchOpen");
        requestAnimationFrame(()=>{
            search.focus({preventScroll:true});
            search.select();
        });
    };

    searchToggle.addEventListener("click",openSearch);

    /* Keep the visual state synchronized with the actual focused control.
       This is presentation only; the existing input/filter event remains
       authoritative for search behavior. */
    search.addEventListener("focus",()=>{
        if(searchGroup)searchGroup.classList.add("searchOpen");
    });
}

/* Restore the library view controls.  Moving Search into the top bar must
   not remove the independent Grid/List controls. */
const shelfButton=document.getElementById("shelfViewButton");
if(shelfButton){
    shelfButton.addEventListener("click",()=>{
        this.showShelf();
    });
}

const listButton=document.getElementById("listViewButton");
if(listButton){
    listButton.addEventListener("click",()=>{
        this.showList();
    });
}

const librarySort=document.getElementById("librarySort");
const libraryCategory=document.getElementById("libraryCategory");
const librarySortButton=document.getElementById("librarySortButton");
const libraryFilterButton=document.getElementById("libraryFilterButton");
const librarySortMenu=document.getElementById("librarySortMenu");
const libraryFilterMenu=document.getElementById("libraryFilterMenu");
const closeOrgMenus=()=>{ librarySortMenu?.classList.add("hidden"); libraryFilterMenu?.classList.add("hidden"); };
if(librarySortButton)librarySortButton.addEventListener("click",event=>{ event.stopPropagation(); libraryFilterMenu?.classList.add("hidden"); librarySortMenu?.classList.toggle("hidden"); });
if(libraryFilterButton)libraryFilterButton.addEventListener("click",event=>{ event.stopPropagation(); librarySortMenu?.classList.add("hidden"); libraryFilterMenu?.classList.toggle("hidden"); });
document.addEventListener("click",event=>{ if(!event.target.closest("#libraryOrganizationControls"))closeOrgMenus(); });
const applySort=()=>{ if(librarySort){ this.setOrganization("main",{sort:String(librarySort.value||"alphabetical")}); closeOrgMenus(); } };
const applyCategory=()=>{ if(libraryCategory){ this.setOrganization("main",{category:String(libraryCategory.value||"all")}); closeOrgMenus(); } };
if(librarySort){ librarySort.addEventListener("change",applySort); librarySort.addEventListener("input",applySort); }
if(libraryCategory){ libraryCategory.addEventListener("change",applyCategory); libraryCategory.addEventListener("input",applyCategory); }


const libraryDrawerClose=document.getElementById("libraryDrawerClose");
if(libraryDrawerClose){
    libraryDrawerClose.addEventListener("click",()=>{
        SkyReader.toggleLibrary(false);
    });
}

const narrowLibraryToggle=document.getElementById("narrowLibraryToggle");
if(narrowLibraryToggle){
    const syncNarrowLibraryToggle=()=>{
        const open=SkyReader.ui.libraryOpen===true;
        narrowLibraryToggle.setAttribute("aria-expanded",open?"true":"false");
        narrowLibraryToggle.title=open?"Close Library":"Open Library";
        narrowLibraryToggle.setAttribute("aria-label",open?"Close Library":"Open Library");
        narrowLibraryToggle.classList.toggle("isOpen",open);
    };
    syncNarrowLibraryToggle();
    narrowLibraryToggle.addEventListener("click",()=>{
        const opening=SkyReader.ui.libraryOpen!==true;
        if(opening){
            if(typeof Library.buildShelf==="function") Library.buildShelf();
            if(typeof Library.buildList==="function") Library.buildList();

        }
        SkyReader.toggleLibrary(opening);
        syncNarrowLibraryToggle();
    });
    window.addEventListener("sr:library-toggle",syncNarrowLibraryToggle);
}

const settingsButton=document.getElementById("settingsButton");

if(settingsButton){

settingsButton.addEventListener("click",()=>{

if(typeof SettingsPanel!=="undefined")SettingsPanel.toggle();

});

}


window.addEventListener("resize",()=>{

this.handleResize();

});

document.addEventListener("keydown",e=>{

this.handleKeyboard(e);

});

},

showShelf(){

SkyReader.toggleView(true);

StorageManager.setShelfView(true);

},

showList(){

SkyReader.toggleView(false);

StorageManager.setShelfView(false);

},

toggleLibrary(){

SkyReader.toggleLibrary();

},

handleResize(){

const narrow=window.innerWidth<=999;
const wasNarrow=this._wasNarrow;
this._wasNarrow=narrow;

if(narrow){
    /* Narrow mode uses the same left library as a pull-out drawer.
       Do not repeatedly force it closed on every resize event. */
    if(wasNarrow===false || typeof wasNarrow==="undefined"){
        SkyReader.toggleLibrary(false);
    }
    window.dispatchEvent(new Event("sr:library-toggle"));
    return;
}

if(window.innerWidth>=1000){
    SkyReader.toggleLibrary(true);
}

},

handleKeyboard(e){

if(e.target.tagName==="INPUT")return;

switch(e.key){

case "Escape":

SkyReader.toggleLibrary(true);

break;

case "l":

case "L":

this.toggleLibrary();

break;

case "/":

e.preventDefault();

const search=document.getElementById("searchBox");

if(search){

search.focus();
search.select();

}

break;

}

},

sortByTitle(){ this.setOrganization("main",{sort:"alphabetical"}); },

sortNewest(){ this.setOrganization("main",{sort:"newest"}); },

sortOldest(){ this.setOrganization("main",{sort:"oldest"}); },

sortRecent(){ this.setOrganization("main",{sort:"recent"}); },

sortRandom(){ this.setOrganization("main",{sort:"random"}); },


openFirstBook(){

if(!SkyReader.filteredLibrary.length)return;

this.open(

SkyReader.filteredLibrary[0].id

);

},

refresh(){

this.build();

if(SkyReader.ui.shelfView){

this.showShelf();

}else{

this.showList();

}

},

initialize(){

this.populateCategories();
this.applyOrganization();
// Manifest data is now authoritative; render immediately on first load.
this.build();

this.initializeEvents();

if(SkyReader.ui.shelfView){

this.showShelf();

}else{

this.showList();

}

this.handleResize();

}

};