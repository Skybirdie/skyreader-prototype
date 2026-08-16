"use strict";

/*
=========================================================

 SkyReader Control Dock

 Combines

 • Reader Status
 • Toolbar

 Handles

 • Auto hide
 • Auto show
 • Hover lock

=========================================================
*/

window.ControlDock=(function(){

const dock={};

let container;

let hideTimer;

let hovering=false;

const AUTO_HIDE_DELAY=10000;

const HIDDEN_OPACITY=.25;

/*-------------------------------------------------------
 Build
-------------------------------------------------------*/

dock.build=function(parent){

    container=document.createElement("div");

    container.id="srControlDock";

    container.className="sr-control-dock";

    container.appendChild(

        ReaderStatus.element()

    );

    container.appendChild(

        Toolbar.element()

    );

    parent.appendChild(container);

    container.addEventListener(

        "mouseenter",

        ()=>{

            hovering=true;

            dock.show();

        }

    );

    container.addEventListener(

        "mouseleave",

        ()=>{

            hovering=false;

            dock.scheduleHide(); 

        }

    );

};

/*-------------------------------------------------------
 Show
-------------------------------------------------------*/

dock.show=function(){

    if(!container){

        return;

    }

    clearTimeout(hideTimer);

    container.classList.remove(

        "dock-hidden"

    );

};

/*-------------------------------------------------------
 Hide
-------------------------------------------------------*/

dock.hide=function(){

    if(!container){

        return;

    }

    if(hovering){

        return;

    }

    container.classList.add(

        "dock-hidden"

    );

};




/*-------------------------------------------------------
 Timer
-------------------------------------------------------*/

dock.scheduleHide=function(){

    clearTimeout(hideTimer);

    hideTimer=setTimeout(

        ()=>{

            dock.hide();

        },

        AUTO_HIDE_DELAY

    );

};


/*-------------------------------------------------------
 Activity
-------------------------------------------------------*/

function activity(){

    dock.show();

    dock.scheduleHide();

}

[
"mousemove",
"mousedown",
"touchstart",
"keydown",
"wheel"
].forEach(eventName=>{

    document.addEventListener(

        eventName,

        activity,

        {

            passive:true

        }

    );

});

/*-------------------------------------------------------
 Reader Hooks
-------------------------------------------------------*/

dock.readerOpened=function(){

    dock.show();

   dock.scheduleHide();

};

dock.readerClosed=function(){

    clearTimeout(hideTimer);

};

/*-------------------------------------------------------
 Access
-------------------------------------------------------*/

dock.element=function(){

    return container;

};

return dock;

})();