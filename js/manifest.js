"use strict";

/*
=========================================================

 SkyReader Manifest / Data Boundary

 Responsibilities

 • Load the current book data source
 • Normalize and validate book records
 • Expose normalized books to the engine
 • Keep the source implementation separate from consumers

 The current prototype fallback source is library.json.
 GlideContract is checked first when Glide supplies a contract.
 The engine receives the same normalized book objects regardless
 of which source supplied them.

=========================================================
*/

window.Manifest={

/*-------------------------------------------------------
 Data Source
-------------------------------------------------------*/

source:{

    url:"library.json",

    async load(){

        const response=await fetch(this.url);

        if(!response.ok){

            throw new Error("Unable to load library.json");

        }

        return response.json();

    }

},

/*-------------------------------------------------------
 Internal Normalized Manifest
-------------------------------------------------------*/

_data:null,

/*-------------------------------------------------------
 Load

 Loads from the configured source, then normalizes the data
 before exposing it to the rest of SkyReader.
-------------------------------------------------------*/

async load(){

    SkyReader.setLoading(5,"Loading library...");

    try{

        const rawManifest=GlideContract.available()
                ? await GlideContract.load()
                : await this.source.load();

        const manifest=this.normalize(rawManifest);

        if(!manifest.books.length){
            throw new Error("No publications are available in the current library.");
        }

        this._data=manifest;

        SkyReader.library=[...manifest.books];

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

        this._data=null;
        SkyReader.library=[];
        SkyReader.filteredLibrary=[];
        console.error("[Manifest] Library load failed",error);
        SkyReader.setStatus(error.message||"Unable to load the library.");
        if(window.UI && typeof UI.showError==="function") UI.showError(error,"Unable to load the SkyReader library.");
        throw error;

    }

},

/*-------------------------------------------------------
 Books

 Returns the normalized book collection.
 Consumers do not need to know which data source supplied it.
-------------------------------------------------------*/

books(){

    return this._data

        ? [...this._data.books]

        : [];

},

/*-------------------------------------------------------
 Normalize

 Converts a source payload into the contract expected by the
 SkyReader engine.
-------------------------------------------------------*/

normalize(rawManifest){

    if(!rawManifest || typeof rawManifest!=="object")

        throw new Error("Invalid manifest.");

    if(!Array.isArray(rawManifest.books))

        throw new Error("Manifest missing books.");

    const books=rawManifest.books.map((book,index)=>{

        const normalized={

            id:book.id||("book_"+index),

            title:book.title,

            subtitle:book.subtitle||"",

            thumbnail:book.thumbnail||"assets/default-thumbnail.png",

            pdf:book.pdf,

            author:book.author||"",

            category:book.category||"",

            pageCount:book.pageCount||"unknown",

            date:book.date??book.releaseDate??book.release_date??""

        };

        if(!normalized.title)

            throw new Error("Book title missing.");

        if(!normalized.pdf)

            throw new Error(

                normalized.title+

                " has no PDF."

            );

        return normalized;

    });

    return{

        books,

        background:rawManifest.background||null

    };

},

/*-------------------------------------------------------
 Backward-Compatible Validation Entry Point
-------------------------------------------------------*/

validate(manifest){

    return this.normalize(manifest);

}

};
