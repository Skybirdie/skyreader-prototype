"use strict";

/*
=========================================================

 SkyReader Bookmark Panel

 Responsibilities

• Display bookmarks
• Jump to bookmark
• Delete bookmark
• Standalone module

=========================================================
*/

window.BookmarkPanel=(function(){

const panel={};

let root;
let list;

let initialized=false;

/*-------------------------------------------------------
 Build
-------------------------------------------------------*/

panel.build=function(parent){

    if(initialized){

        return;

    }

    root=document.createElement("aside");

    root.id="srBookmarkPanel";

    root.className="sr-bookmark-panel";

    root.hidden=true;

    const header=document.createElement("div");
    header.className="sr-bookmark-header";

    const title=document.createElement("h3");
    title.textContent="Bookmarks";

    const close=document.createElement("button");
    close.className="sr-bookmark-close";
    close.innerHTML="✕";

    close.addEventListener(

        "click",

        ()=>{

            panel.hide();

        }

    );

    header.appendChild(title);
    header.appendChild(close);

    list=document.createElement("div");
    list.className="sr-bookmark-list";

    root.appendChild(header);
    root.appendChild(list);

    parent.appendChild(root);

    initialized=true;

};

/*-------------------------------------------------------
 Refresh
-------------------------------------------------------*/

panel.refresh=function(){

    if(!initialized){

        return;

    }

    list.innerHTML="";

    const currentBook=

        SRNavigation.book();

    const items=

        Bookmarks.all()

        .filter(

            b=>b.book===currentBook

        )

        .sort(

            (a,b)=>a.page-b.page

        );

    if(items.length===0){

        const empty=document.createElement("div");

        empty.className="sr-bookmark-empty";

        empty.textContent=

            "No bookmarks.";

        list.appendChild(empty);

        return;

    }

    items.forEach(item=>{

        list.appendChild(

            createBookmark(item)

        );

    });

};

/*-------------------------------------------------------
 Bookmark Row
-------------------------------------------------------*/

function createBookmark(item){

    const row=document.createElement("div");

    row.className="sr-bookmark-row";

    const page=document.createElement("button");

    page.className="sr-bookmark-page";

    page.textContent=

        "Page "+

        (item.page+1);

    page.addEventListener(

        "click",

        ()=>{

            SRNavigation.goToPage(

                item.page

            );

            panel.hide();

        }

    );

    const remove=document.createElement("button");

    remove.className="sr-bookmark-delete";

    remove.textContent="🗑";

    remove.addEventListener(

        "click",

        ()=>{

            Bookmarks.remove(item.id);

            panel.refresh();

        }

    );

    row.appendChild(page);

    row.appendChild(remove);

    return row;

}

/*-------------------------------------------------------
 Visibility
-------------------------------------------------------*/

panel.show=function(){

    panel.refresh();

    root.hidden=false;

};

panel.hide=function(){

    root.hidden=true;

};

panel.toggle=function(){

    if(root.hidden){

        panel.show();

    }else{

        panel.hide();

    }

};

/*-------------------------------------------------------
 Helpers
-------------------------------------------------------*/

panel.visible=function(){

    return !root.hidden;

};

panel.element=function(){

    return root;

};

/*-------------------------------------------------------
 Destroy
-------------------------------------------------------*/

panel.destroy=function(){

    if(

        root &&

        root.parentNode

    ){

        root.parentNode.removeChild(root);

    }

    root=null;

    list=null;

    initialized=false;

};

return panel;

})();