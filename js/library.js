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

    if(this._selectHandler){
        return this._selectHandler(book,page);
    }

    return this.open(book.id,page);

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

SkyReader.filteredLibrary.forEach(book=>{

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
        <img src="${book.thumbnail}" alt="">
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

src="${book.thumbnail}">

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

this.searchText=text.toLowerCase();

SkyReader.filteredLibrary=

SkyReader.library.filter(book=>{

return(

book.title

.toLowerCase()

.includes(this.searchText)

||

(book.subtitle||"")

.toLowerCase()

.includes(this.searchText)

);

});

this.build();

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
        section.style.display="none";
        card.style.display="none";
        if(panel) panel.classList.add("noContinue");
        this.updateViewerContinue();
        return;
    }

    const lastPage=Math.max(1,Number(SkyReader.resume.page)||1);
    if(panel) panel.classList.remove("noContinue");
    section.style.display="";
    card.style.display="flex";
    card.innerHTML=`
        <div class="thumbnailPlaceholder">
            <img src="${book.thumbnail}" alt="${book.title}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">
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

console.log(
    "Opening",
    book.title
);

console.log("[Library] Calling SRNavigation");
SRNavigation.openMagazine(book,page);

},

initializeEvents(){

const search=document.getElementById("searchBox");
const searchToggle=document.getElementById("searchToggleButton");

if(search){

search.addEventListener("input",e=>{

this.filter(e.target.value);

});

}

if(searchToggle && search){

searchToggle.addEventListener("click",()=>{

const wrapper=document.getElementById("searchWrapper");
if(!wrapper)return;

const expanded=wrapper.classList.toggle("searchExpanded");
searchToggle.setAttribute("aria-expanded",String(expanded));

if(expanded){
requestAnimationFrame(()=>{
search.focus();
search.select();
});
}

});

search.addEventListener("keydown",event=>{
if(event.key==="Escape"){
search.value="";
this.filter("");
const wrapper=document.getElementById("searchWrapper");
if(wrapper)wrapper.classList.remove("searchExpanded");
if(searchToggle)searchToggle.setAttribute("aria-expanded","false");
search.blur();
}
});

}

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

const settingsButton=document.getElementById("settingsButton");

if(settingsButton){

settingsButton.addEventListener("click",()=>{

if(typeof SettingsPanel!=="undefined")SettingsPanel.toggle();

});

}

const libraryButton=document.getElementById("libraryButton");

if(libraryButton){

libraryButton.addEventListener("click",()=>{

this.toggleLibrary();

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

if(window.innerWidth<=760){

    /* The library becomes a scrollable dock below the viewer. */
    SkyReader.toggleLibrary(true);

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

sortByTitle(){

SkyReader.filteredLibrary.sort((a,b)=>{

return a.title.localeCompare(b.title);

});

this.build();

},

sortNewest(){

SkyReader.filteredLibrary.sort((a,b)=>{

const da=new Date(a.date||0);

const db=new Date(b.date||0);

return db-da;

});

this.build();

},

sortRecent(){

const last=StorageManager.load();

if(!last.lastMagazine){

this.sortByTitle();

return;

}

SkyReader.filteredLibrary.sort((a,b)=>{

if(a.id===last.lastMagazine)return -1;

if(b.id===last.lastMagazine)return 1;

return a.title.localeCompare(b.title);

});

this.build();

},

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