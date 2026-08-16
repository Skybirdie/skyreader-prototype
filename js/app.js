"use strict";

/*
=========================================================

 SkyReader

 Application Bootstrap

 Coordinates all application modules.

=========================================================
*/

window.App=(function(){

const app={};

/*-------------------------------------------------------
  SkyReader
-------------------------------------------------------*/

let initialized=false;

let started=false;

let manifestLoaded=false;

/*-------------------------------------------------------
  Configuration
-------------------------------------------------------*/

const config={

debug:false,

version:"1.0.0",

defaultView:"library"

};

/*-------------------------------------------------------
  Status
-------------------------------------------------------*/

app.initialized=function(){

    return initialized;

};

app.started=function(){

    return started;

};

app.manifestLoaded=function(){

    return manifestLoaded;

};

app.version=function(){

    return config.version;

};

/*-------------------------------------------------------
  Logging
-------------------------------------------------------*/

function log(){

    if(!config.debug){

        return;

    }

    console.log(

        "[SkyReader]",

        ...arguments

    );

}

/*-------------------------------------------------------
  Configure
-------------------------------------------------------*/

app.configure=function(options={}){

    Object.assign(

        config,

        options

    );

};

/*-------------------------------------------------------
  Initialize Modules
-------------------------------------------------------*/

async function initializeModules(){

    log("Initializing modules...");

    StorageManager.load();



    Renderer.initialize();

    Reader.initialize();

    SRNavigation.initialize();

    UI.initialize();

    initialized=true;

    log("Modules initialized.");

}

/*-------------------------------------------------------
  Cache DOM
-------------------------------------------------------*/

function cacheDom(){

    log("Caching UI...");

    if(typeof UI.cache==="function"){

        UI.cache();

    }

}

/*-------------------------------------------------------
  Attach Events
-------------------------------------------------------*/

function attachEvents(){

    log("Attaching events...");

    SRNavigation.attach();

    if(typeof UI.attach==="function"){

        UI.attach();

    }

}

/*-------------------------------------------------------
  Load Manifest
-------------------------------------------------------*/

async function loadManifest(){

    log("Loading manifest...");

    await Manifest.load();

    manifestLoaded=true;

    log("Manifest loaded.");

}

/*-------------------------------------------------------
  Build Library
-------------------------------------------------------*/

async function buildLibrary(){

    log("Building library...");

    SkyReader.filteredLibrary = [...SkyReader.library];

    Library.initialize();

    log(

        "Library ready:",

        SkyReader.library.length,

        "books"

    );

}
/*-------------------------------------------------------
  Show Default View
-------------------------------------------------------*/

function showDefaultView(){

    switch(config.defaultView){

        case "reader":

            UI.showReader();

            break;

        default:

            UI.showLibrary();

            break;

    }

}


/*-------------------------------------------------------
  Initialize Feature Modules
-------------------------------------------------------*/

function initializeFeatureModules(){

    if(
    typeof BookmarkPanel!=="undefined" &&
    typeof BookmarkPanel.build==="function"
){

        BookmarkPanel.build(document.body);

    }

    if(
    typeof RecentShelf!=="undefined" &&
    typeof RecentShelf.build==="function"
){
    RecentShelf.build(document.body);
}

    if(

typeof TableOfContents!=="undefined" &&
typeof TableOfContents.build==="function"){

        TableOfContents.build(document.body);

    }

    if(
typeof SearchPanel!=="undefined" &&
typeof SearchPanel.build==="function"){

        SearchPanel.build(document.body);

    }
    if(
typeof ReaderStatus!=="undefined" &&
typeof ReaderStatus.build==="function"){

        ReaderStatus.build(document.body);

    }

    if(
typeof ReadingStats!=="undefined" &&
typeof ReadingStats.build==="function"){

        ReadingStats.build(document.body);

    }

    if(
typeof RecentReading!=="undefined" &&
typeof RecentReading.build==="function"){

        RecentReading.build(document.body);

    }

}

/*-------------------------------------------------------
  Wire Modules
-------------------------------------------------------*/

function connectModules(){

    log("Connecting modules...");

    /*---------------------------------------------------
      Library → Navigation

      Library reports selection; it does not know how the
      Reader is opened. App coordinates the handoff.
    ---------------------------------------------------*/

    if(typeof Library.onSelect==="function"){

        Library.onSelect(async(book,startPage=null)=>{

            /*
             * Start the visual handoff immediately. The previous loading
             * overlay was only useful after Reader.open() had progressed,
             * while the viewer-library landing remained on top until the
             * bookOpened event. That made the opening delay feel like the
             * app was stuck on the landing screen.
             *
             * BeginBookOpen hides the landing immediately and exposes the
             * loading.gif overlay before PDF.js/StPageFlip initialization.
             */
            if(typeof UI!=="undefined" &&
               typeof UI.beginBookOpen==="function"){
                UI.beginBookOpen("Loading book...");
            }

            /* Give the browser one paint opportunity to display the loader
               before starting the potentially expensive PDF open. */
            await new Promise(resolve=>requestAnimationFrame(resolve));

            const opened = await SRNavigation.openMagazine(
                book,
                startPage
            );

            if(!opened &&
               typeof UI!=="undefined" &&
               typeof UI.clearLoading==="function"){
                UI.clearLoading();
            }

            if(!opened)return;

            /* Floating reader controls are only available while a book
               is actively open. */
            if(typeof UI!=="undefined" && typeof UI.showToolbar==="function"){
                UI.showToolbar();
            }

            if(
                typeof RecentReading!=="undefined" &&
                typeof RecentReading.add==="function"
            ){
                RecentReading.add(book.id);
            }

            if(
                typeof ReadingStats!=="undefined" &&
                typeof ReadingStats.begin==="function"
            ){
                ReadingStats.begin(book.id);
            }

            if(
                typeof ReaderStatus!=="undefined" &&
                typeof ReaderStatus.show==="function"
            ){
                ReaderStatus.show(book);
            }

            if(
                typeof TableOfContents!=="undefined" &&
                typeof TableOfContents.load==="function"
            ){
                TableOfContents.load(book);
            }

            if(
                typeof SearchPanel!=="undefined" &&
                typeof SearchPanel.clear==="function"
            ){
                SearchPanel.clear();
            }

            return true;

        });

    }

    /*---------------------------------------------------
      Reader close
    ---------------------------------------------------*/

    if(typeof UI.onCloseReader==="function"){

        UI.onCloseReader(async()=>{

            await SRNavigation.closeMagazine();

            if(
                typeof ReadingStats!=="undefined" &&
                typeof ReadingStats.end==="function"
            ){
                ReadingStats.end();
            }

            if(
                typeof ReaderStatus!=="undefined" &&
                typeof ReaderStatus.hide==="function"
            ){
                ReaderStatus.hide();
            }

            if(
                typeof TableOfContents!=="undefined" &&
                typeof TableOfContents.clear==="function"
            ){
                TableOfContents.clear();
            }

            if(
                typeof SearchPanel!=="undefined" &&
                typeof SearchPanel.clear==="function"
            ){
                SearchPanel.clear();
            }

        });

    }

    if(typeof UI.onRotate==="function"){

        UI.onRotate(()=>{

            SRNavigation.rotate();

        });

    }

    if(typeof UI.onNext==="function"){

        UI.onNext(()=>{

            SRNavigation.next();

        });

    }

    if(typeof UI.onPrevious==="function"){

        UI.onPrevious(()=>{

            SRNavigation.previous();

        });

    }

    if(typeof UI.onMute==="function"){

        UI.onMute(()=>{

            AudioController.toggleMute();

        });

    }

}

/*-------------------------------------------------------
  Start
-------------------------------------------------------*/

app.start=async function(){

    if(started){

        return;

    }

    log("Starting SkyReader...");

    await initializeModules();

cacheDom();

attachEvents();

await loadManifest();

await buildLibrary();

initializeFeatureModules();

connectModules();

showDefaultView();

    started=true;

    log("SkyReader started.");

};

/*-------------------------------------------------------
  Shutdown
-------------------------------------------------------*/

app.shutdown=function(){

    log("Shutting down...");

    started=false;

};

/*-------------------------------------------------------
  Restart
-------------------------------------------------------*/

app.restart=async function(){

    app.shutdown();

    await app.start();

};

/*-------------------------------------------------------
  Diagnostics
-------------------------------------------------------*/

app.modules=function(){

    return{

        SkyReader:typeof SkyReader!=="undefined",

        StorageManager:typeof StorageManager!=="undefined",

        Manifest:typeof Manifest!=="undefined",

        Library:typeof Library!=="undefined",

        Reader:typeof Reader!=="undefined",

        Renderer:typeof Renderer!=="undefined",

        UI:typeof UI!=="undefined",

        SRNavigation:typeof SRNavigation!=="undefined",

        Animation:typeof Animation!=="undefined",

        AudioController:typeof AudioController!=="undefined"

    };

};

app.status=function(){

    return{

        initialized,

        started,

        manifestLoaded,

        version:config.version,

        modules:app.modules()

    };

};

/*-------------------------------------------------------
  Global Error Handling
-------------------------------------------------------*/

window.addEventListener(

    "error",

    function(event){

        console.error(

            "[SkyReader]",

            event.error||event.message

        );

    }

);

window.addEventListener(

    "unhandledrejection",

    function(event){

        console.error(

            "[SkyReader]",

            event.reason

        );

    }

);

/*-------------------------------------------------------
  Ready Banner
-------------------------------------------------------*/

function readyBanner(){

    if(!config.debug){

        return;

    }

    console.group(

        "SkyReader "+config.version

    );

    console.log(

        "Application Ready"

    );

    console.table(

        app.modules()

    );

    console.groupEnd();

}

/*-------------------------------------------------------
  DOM Ready
-------------------------------------------------------*/

async function bootstrap(){

    try{

        await app.start();

        readyBanner();

    }

    catch(error){

        console.error(

            "SkyReader failed to start.",

            error

        );

    }

}

/*-------------------------------------------------------
  Automatic Startup
-------------------------------------------------------*/

if(

    document.readyState==="loading"

){

    document.addEventListener(

        "DOMContentLoaded",

        bootstrap,

        {

            once:true

        }

    );

}

else{

    bootstrap();

}

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return app;

})();
