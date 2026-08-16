"use strict";

window.Manifest={

url:"library.json",

async load(){

SkyReader.setLoading(5,"Loading library...");

try{

const response=await fetch(this.url);

if(!response.ok){

throw new Error("Unable to load library.json");

}

const manifest=await response.json();

this.validate(manifest);

SkyReader.library=manifest.books;

SkyReader.filteredLibrary=[...manifest.books];

SkyReader.settings.background=

manifest.background||

SkyReader.settings.background;

document.getElementById("viewerBackground").style.backgroundImage=

`url('${SkyReader.settings.background}')`;

SkyReader.setLoading(20,"Library loaded");

return manifest;

}

catch(error){

console.error(error);

SkyReader.setStatus(error.message);

throw error;

}

},

validate(manifest){

if(typeof manifest!=="object")

throw new Error("Invalid manifest.");

if(!Array.isArray(manifest.books))

throw new Error("Manifest missing books.");

manifest.books.forEach((book,index)=>{

if(!book.id)

book.id="book_"+index;

if(!book.title)

throw new Error("Book title missing.");

if(!book.pdf)

throw new Error(

book.title+

" has no PDF."

);

if(!book.thumbnail)

book.thumbnail="assets/default-thumbnail.png";

});

}

};