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
 Newest
-------------------------------------------------------*/

function newest(){

    return copyBooks().sort(

        (a,b)=>

        new Date(

            b.date||

            0

        )-

        new Date(

            a.date||

            0

        )

    );

}

/*-------------------------------------------------------
 Oldest
-------------------------------------------------------*/

function oldest(){

    return copyBooks().sort(

        (a,b)=>

        new Date(

            a.date||

            0

        )-

        new Date(

            b.date||

            0

        )

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