"use strict";

/*
=========================================================

 SkyReader Bookmarks

=========================================================
*/

window.Bookmarks=(function(){

const bookmarks={};

const KEY="skyreader-bookmarks";

/*-------------------------------------------------------
 Load
-------------------------------------------------------*/

function load(){

    return Storage.get(KEY,[]);

}

/*-------------------------------------------------------
 Save
-------------------------------------------------------*/

function save(data){

    Storage.set(KEY,data);

}

/*-------------------------------------------------------
 Add
-------------------------------------------------------*/

bookmarks.add=function(book,page){

    const data=load();

    const existing=data.find(

        b=>

        b.book===book &&

        b.page===page

    );

    if(existing){

        return;

    }

    data.push({

        id:Date.now(),

        book,

        page,

        created:new Date().toISOString()

    });

    save(data);

};

/*-------------------------------------------------------
 Remove
-------------------------------------------------------*/

bookmarks.remove=function(id){

    save(

        load().filter(

            b=>b.id!==id

        )

    );

};

/*-------------------------------------------------------
 All
-------------------------------------------------------*/

bookmarks.all=function(){

    return load();

};

/*-------------------------------------------------------
 Clear
-------------------------------------------------------*/

bookmarks.clear=function(){

    save([]);

};

return bookmarks;

})();