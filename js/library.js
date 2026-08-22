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

this.updateReadAgain();

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

    wrap.innerHTML=`
    <div class="viewerContinueCard" title="Read again: ${book.title}">
        <img src="${book.thumbnail||"assets/default-thumbnail.png"}" alt="" onerror="if(this.dataset.fallbackApplied==='true'){this.style.display='none';return;}this.dataset.fallbackApplied='true';this.src='assets/default-thumbnail.png';">
        <div class="viewerContinueText">
            <strong>Read Again: ${book.title}</strong>
            <span>Last viewed: page ${lastPage}</span>
        </div>
    </div>`;

    wrap.classList.remove("hidden");
    const card=wrap.querySelector(".viewerContinueCard");
    if(card){
        card.onclick=()=>this.select(book,1);
    }
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

item.innerHTML=

`

<div class="listThumb">

<img loading="lazy"

src="${book.thumbnail||"assets/default-thumbnail.png"}" onerror="if(this.dataset.fallbackApplied==='true'){this.style.display='none';return;}this.dataset.fallbackApplied='true';this.src='assets/default-thumbnail.png';">

</div>

<div class="listInfo">

<div class="listTitle">

${book.title}

</div>

<div class="listSubtitle">

${book.subtitle||""}

</div>

</div>

`;

item.onclick=()=>{

this.select(book,1);

};

return item;

},

filter(text){

this.searchText=String(text||"").toLowerCase();
this.applyOrganization();

},


getReadAgainBook(){
    const id=SkyReader.resume && SkyReader.resume.magazineId;
    if(!id)return null;
    return SkyReader.library.find(book=>book.id===id)||null;
},

updateReadAgain(){
    const section=document.getElementById("continueReading");
    const card=document.getElementById("continueCard");
    const book=this.getReadAgainBook();

    if(!section || !card)return;

    const panel=document.getElementById("libraryPanel");

    if(!book){
        // Keep the compact Read Again header visible, but never leave an
        // expanded empty placeholder occupying panel space.
        section.style.display="";
        section.classList.add("continueCollapsed");
        card.style.display="none";
        if(panel) panel.classList.add("noContinue");
        this.updateViewerContinue();
        return;
    }

    const lastPage=Math.max(1,Number(SkyReader.resume.page)||1);
    const visible=SkyReader.settings.readAgainVisible!==false;
    if(panel) panel.classList.remove("noContinue");
    section.style.display="";
    section.classList.toggle("continueCollapsed",!visible);
    card.style.display=visible?"flex":"none";
    card.innerHTML=`
        <div class="thumbnailPlaceholder">
            <img src="${book.thumbnail||"assets/default-thumbnail.png"}" alt="${book.title}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" onerror="if(this.dataset.fallbackApplied==='true'){this.style.display='none';return;}this.dataset.fallbackApplied='true';this.src='assets/default-thumbnail.png';">
        </div>
        <div class="placeholderText">
            <h3>${book.title}</h3>
            <p>Last viewed: page ${lastPage}</p>
        </div>`;
    card.onclick=()=>this.select(book,1);

    this.updateViewerContinue();
    if(typeof RecentShelf!=="undefined" && typeof RecentShelf.refresh==="function") RecentShelf.refresh();
},

/* Backward-compatible alias for modules that still call the old name. */
updateContinueReading(){
    this.updateReadAgain();
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
    searchToggle.addEventListener("click",()=>{
        requestAnimationFrame(()=>{
            search.focus();
            search.select();
        });
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

const continueToggle=document.getElementById("continueToggleButton");
if(continueToggle){
    const syncContinueToggle=()=>{
        const visible=SkyReader.settings.readAgainVisible!==false;
        continueToggle.textContent=visible?"−":"+";
        continueToggle.setAttribute("aria-label",visible?"Hide Read Again":"Show Read Again");
        continueToggle.title=visible?"Hide Read Again":"Show Read Again";
    };
    syncContinueToggle();
    continueToggle.addEventListener("click",()=>{
        SkyReader.settings.readAgainVisible=SkyReader.settings.readAgainVisible===false;
        StorageManager.saveSettings();
        syncContinueToggle();
        this.updateReadAgain();
    });
}

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
            if(typeof Library.updateReadAgain==="function") Library.updateReadAgain();
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