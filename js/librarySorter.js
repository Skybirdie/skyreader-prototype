"use strict";

/*
=========================================================

 SkyReader Library Sorter

 Responsibilities

• Sort books
• Filter books
• Standalone module

=========================================================
*/

window.LibrarySorter=(function(){

const sorter={};

/*-------------------------------------------------------
 Sort Modes
-------------------------------------------------------*/

sorter.modes={

    ALPHABETICAL:"alphabetical",

    NEWEST:"newest",

    OLDEST:"oldest",

    RECENT:"recent",

    FAVORITES:"favorites",

    CONTINUE:"continue"

};

/*-------------------------------------------------------
 Copy
-------------------------------------------------------*/

function copyBooks(){

    return [...Manifest.books()];

}

/*-------------------------------------------------------
 Alphabetical
-------------------------------------------------------*/

function alphabetical(){

    return copyBooks().sort(

        (a,b)=>

        a.title.localeCompare(

            b.title

        )

    );

}

/*-------------------------------------------------------
 Book Date Parser

 Contract format:
 YYYYMMDDHHmm
  |   | | | |
  |   | | | +-- minute
  |   | | +---- hour
  |   | +------ day
  |   +-------- month
  +------------ year

 The contract uses human-readable month numbering (01-12).
 JavaScript Date uses zero-based months (0-11), so the month
 is converted explicitly below. Invalid or normalized dates
 are rejected rather than silently interpreted differently.
-------------------------------------------------------*/

function parseBookDate(value){

    if(typeof value!=="string") return 0;

    const match=value.match(

        /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/

    );

    if(!match) return 0;

    const year=Number(match[1]);
    const month=Number(match[2]);
    const day=Number(match[3]);
    const hour=Number(match[4]);
    const minute=Number(match[5]);

    if(
        month<1 || month>12 ||
        day<1 || day>31 ||
        hour<0 || hour>23 ||
        minute<0 || minute>59
    ){
        return 0;
    }

    const date=new Date(

        year,
        month-1,
        day,
        hour,
        minute

    );

    if(
        date.getFullYear()!==year ||
        date.getMonth()!==month-1 ||
        date.getDate()!==day ||
        date.getHours()!==hour ||
        date.getMinutes()!==minute
    ){
        return 0;
    }

    return date.getTime();

}

/*-------------------------------------------------------
 Newest
-------------------------------------------------------*/

function newest(){

    return copyBooks().sort(

        (a,b)=>

        parseBookDate(b.date)-
        parseBookDate(a.date)

    );

}

/*-------------------------------------------------------
 Oldest
-------------------------------------------------------*/

function oldest(){

    return copyBooks().sort(

        (a,b)=>

        parseBookDate(a.date)-
        parseBookDate(b.date)

    );

}
/*-------------------------------------------------------
 Favorites
-------------------------------------------------------*/

function favorites(){

    return Favorites.books();

}

/*-------------------------------------------------------
 Continue Reading
-------------------------------------------------------*/

function continueReading(){

    const recent=

        RecentReading.all();

    return recent

        .map(entry=>

            Manifest

            .books()

            .find(

                book=>

                book.id===entry.book

            )

        )

        .filter(Boolean);

}

/*-------------------------------------------------------
 Recently Read
-------------------------------------------------------*/

function recentlyRead(){

    const recent=

        RecentReading.all();

    return recent

        .map(entry=>

            Manifest

            .books()

            .find(

                book=>

                book.id===entry.book

            )

        )

        .filter(Boolean);

}

/*-------------------------------------------------------
 Sort
-------------------------------------------------------*/

sorter.sort=function(mode){

    switch(mode){

        case sorter.modes.NEWEST:

            return newest();

        case sorter.modes.OLDEST:

            return oldest();

        case sorter.modes.FAVORITES:

            return favorites();

        case sorter.modes.RECENT:

            return recentlyRead();

        case sorter.modes.CONTINUE:

            return continueReading();

        case sorter.modes.ALPHABETICAL:

        default:

            return alphabetical();

    }

};

/*-------------------------------------------------------
 Filters
-------------------------------------------------------*/

sorter.filters={

    unread:function(){

        return Manifest

            .books()

            .filter(book=>{

                const stats=

                    ReadingStats.book(

                        book.id

                    );

                return !stats;

            });

    },

    completed:function(){

        return Manifest

            .books()

            .filter(book=>{

                const stats=

                    ReadingStats.book(

                        book.id

                    );

                return(

                    stats &&

                    stats.completed

                );

            });

    },

    favorites:function(){

        return Favorites.books();

    },

    recent:function(){

        return recentlyRead();

    }

};

/*-------------------------------------------------------
 Names
-------------------------------------------------------*/

sorter.displayNames={

    alphabetical:

        "Alphabetical",

    newest:

        "Newest",

    oldest:

        "Oldest",

    recent:

        "Recently Read",

    favorites:

        "Favorites",

    continue:

        "Continue Reading"

};

/*-------------------------------------------------------
 Available Modes
-------------------------------------------------------*/

sorter.available=function(){

    return Object.values(

        sorter.modes

    );

};

/*-------------------------------------------------------
 Default
-------------------------------------------------------*/

sorter.defaultMode=function(){

    return sorter.modes.ALPHABETICAL;

};

/*-------------------------------------------------------
 Exists
-------------------------------------------------------*/

sorter.exists=function(mode){

    return sorter

        .available()

        .includes(mode);

};

/*-------------------------------------------------------
 Reset
-------------------------------------------------------*/

sorter.reset=function(){

    return alphabetical();

};

return sorter;

})();