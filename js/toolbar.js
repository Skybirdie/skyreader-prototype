"use strict";

/*
=========================================================

 SkyReader Toolbar

 Responsibilities

 • Build toolbar
 • SVG icons
 • Active states
 • Disabled states
 • Dispatch toolbar actions

=========================================================
*/

window.Toolbar=(function(){

const toolbar={};

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

let initialized=false;

let container=null;

const buttons=new Map();

/*-------------------------------------------------------
  Toolbar Definition
-------------------------------------------------------*/

const items=[

{
id:"library",
title:"Library",
icon:"library"
},

{
id:"previous",
title:"Previous Page",
icon:"previous"
},

{
id:"next",
title:"Next Page",
icon:"next"
},

{
id:"rotate",
title:"Rotate",
icon:"rotate"
},

{
id:"bookmark",
title:"Bookmark Page",
icon:"bookmark"
},

{
id:"mute",
title:"Mute",
icon:"mute"
},

{
id:"fit",
title:"Fit Page",
icon:"fit"
},

{
id:"fullscreen",
title:"Fullscreen",
icon:"fullscreen"
}

];

/*-------------------------------------------------------
  Icons
-------------------------------------------------------*/

function icon(name){

if(

window.Icons &&

typeof Icons.get==="function"

){

return Icons.get(name);

}

return "";

}

/*-------------------------------------------------------
  Button
-------------------------------------------------------*/

function createButton(item){

const button=document.createElement("button");

button.className="sr-toolbar-button";

button.dataset.action=item.id;

button.title=item.title;

button.innerHTML=icon(item.icon);

button.addEventListener(

"click",

()=>{

toolbar.dispatch(item.id);

}

);

buttons.set(

item.id,

button

);

return button;

}

/*-------------------------------------------------------
  Build
-------------------------------------------------------*/

toolbar.build=function(parent){

container=document.createElement("div");

container.id="srToolbar";

container.className="sr-toolbar";

items.forEach(item=>{

container.appendChild(

createButton(item)

);

});

parent.appendChild(container);

initialized=true;

};

/*-------------------------------------------------------
  Dispatch
-------------------------------------------------------*/

toolbar.dispatch=function(action){

document.dispatchEvent(

new CustomEvent(

"skyreader:toolbar",

{

detail:{

action

}

}

)

);

};

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

toolbar.enable=function(id){

const button=buttons.get(id);

if(button){

button.disabled=false;

}

};

toolbar.disable=function(id){

const button=buttons.get(id);

if(button){

button.disabled=true;

}

};

toolbar.active=function(id,state=true){

const button=buttons.get(id);

if(!button){

return;

}

button.classList.toggle(

"active",

state

);

};

/*-------------------------------------------------------
  Visibility
-------------------------------------------------------*/

toolbar.show=function(){

if(container){

container.hidden=false;

}

};

toolbar.hide=function(){

if(container){

container.hidden=true;

}

};

/*-------------------------------------------------------
  Accessors
-------------------------------------------------------*/

toolbar.element=function(){

return container;

};

toolbar.button=function(id){

return buttons.get(id);

};

toolbar.initialized=function(){

return initialized;

};

/*-------------------------------------------------------
  Toolbar Event Router
-------------------------------------------------------*/

function onToolbarAction(event){

    const action=event.detail.action;

    switch(action){

        case "library":

            SRNavigation.closeMagazine();

            break;

        case "previous":

            SRNavigation.previous();

            break;

        case "next":

            SRNavigation.next();

            break;

        case "rotate":

            SRNavigation.rotate();

            break;

        case "mute":

            AudioController.toggleMute();

            toolbar.active(

                "mute",

                AudioController.isMuted()

            );

            break;

        case "fit":

            if(

                typeof UI.fitPage==="function"

            ){

                UI.fitPage();

                toolbar.active("fit");

            }

            break;

        case "fullscreen":

            if(

                typeof UI.toggleFullscreen==="function"

            ){

                UI.toggleFullscreen();

            }

            break;

case "bookmark":

    if(!Reader.isOpen()){

        break;

    }

    Bookmarks.add(

        SRNavigation.book(),

        Reader.currentPage()

    );

    toolbar.active("bookmark");

    setTimeout(()=>{

        toolbar.active(

            "bookmark",

            false

        );

    },400);

    break;

    }

}

/*-------------------------------------------------------
  Event Registration
-------------------------------------------------------*/

toolbar.attach=function(){

    document.addEventListener(

        "skyreader:toolbar",

        onToolbarAction

    );

};

toolbar.detach=function(){

    document.removeEventListener(

        "skyreader:toolbar",

        onToolbarAction

    );

};

/*-------------------------------------------------------
  Reader State
-------------------------------------------------------*/

toolbar.update=function(){

    if(

        !Reader ||

        !Reader.isOpen()

    ){

        toolbar.disable("previous");

        toolbar.disable("next");

        toolbar.disable("rotate");

        toolbar.disable("fit");

        return;

    }

    toolbar.enable("rotate");

    toolbar.enable("fit");

    const page=

        Reader.currentPage();

    const pages=

        Reader.pageCount();

    if(page<=0){

        toolbar.disable("previous");

    }else{

        toolbar.enable("previous");

    }

    if(page>=pages-1){

        toolbar.disable("next");

    }else{

        toolbar.enable("next");

    }

};

/*-------------------------------------------------------
  Reader Events
-------------------------------------------------------*/

toolbar.readerOpened=function(){

    toolbar.show();

    toolbar.update();

};

toolbar.readerClosed=function(){

    toolbar.hide();

};

/*-------------------------------------------------------
  Initialization
-------------------------------------------------------*/

toolbar.initialize=function(parent){

    if(initialized){

        return;

    }

    toolbar.build(parent);

    toolbar.attach();

    toolbar.hide();

};

/*-------------------------------------------------------
  Cleanup
-------------------------------------------------------*/

toolbar.destroy=function(){

    toolbar.detach();

    buttons.clear();

    if(

        container &&

        container.parentNode

    ){

        container.parentNode.removeChild(

            container

        );

    }

    container=null;

    initialized=false;

};