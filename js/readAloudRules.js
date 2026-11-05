"use strict";

/* =========================================================
   readAloudRules.js - how "Listen" (js/readAloud.js) SPEAKS the text.

   This file only changes what the voice is handed. It never changes
   what is shown on a page. To adjust the way something is read, edit
   the lists in the three EDIT HERE sections below; nothing else needs
   to be touched.

   Every rule works on one sentence-sized piece of text at a time and
   is a pure function (no page, no network, no cost).

   1. WORDS       a word that should be said another way (names, acronyms)
   2. ABBREVIATIONS  "e.g." -> "for example", "Dr." -> "Doctor", "U.S." -> "U S"
   3. PUNCTUATION colons, semicolons and dashes are never spoken, they only
                  separate what is before from what is after them
   4. LISTS       "apples, pears and oranges" -> "apples, pears, and oranges"
   5. NUMBERS     "16 For God so loved" -> "16. For God so loved" (a pause after a
                  number that starts a sentence)
   6. SUPERSCRIPTS footnote and verse numbers: readAloud.js marks them, a full stop
                  is spoken after each one
   7. PAUSES      a real silent gap after every paragraph / forced line break
                  (see GAPS). readAloud.js reads these numbers.
   Ornamental symbols (stars, diamonds, emoji ...) are handled in readAloud.js:
   never described; a bullet at the start of a line, a full stop elsewhere.
========================================================= */

window.ReadAloudRules=(function(){

const api={};

/*=======================================================
  EDIT HERE (1/3) - WORDS
  [ "written word", "how to say it" ]
  Whole words only, any capitals; "Liburd's" is covered by "Liburd".
  Write the spoken form the way it should SOUND.
=======================================================*/
api.words=[
    ["MMICJ",     "M M I C J"],        /* an acronym: read letter by letter */
    ["Liburd",    "Lie bird"],
    ["Naphatali", "Nah fah tah lee"]
];

/*=======================================================
  EDIT HERE (2/3) - ABBREVIATIONS
  [ "pattern", "how to say it", options ]
  The pattern is a regular expression for the abbreviation (dots escaped
  as \\. ). Capital letters at the start are kept: "E.g." -> "For example".
  options.breakBeforeCapital: the abbreviation can end a sentence
  ("... and so on etc. The next ...") so a full stop is kept there.
  Dotted capitals not listed here (U.S., U.K., N.B., J.R.R.) are spelled
  out as letters automatically: "U S", "U K", "N B".
=======================================================*/
api.abbreviations=[
    ["e\\.g\\.?",       "for example"],
    ["i\\.e\\.?",       "that is"],
    ["etc\\.?",         "et cetera", {breakBeforeCapital:true}],
    ["vs\\.?",          "versus"],
    ["cf\\.",           "compare"],
    ["viz\\.",          "namely"],
    ["Mr\\.",           "Mister"],
    ["Mrs\\.",          "Missus"],
    ["Ms\\.",           "Miz"],
    ["Dr\\.",           "Doctor"],
    ["Prof\\.",         "Professor"],
    ["Rev\\.",          "Reverend"],
    ["Jr\\.",           "Junior"],
    ["Sr\\.",           "Senior"],
    ["Fig\\.",          "Figure"],
    ["Figs\\.",         "Figures"],
    ["Vol\\.",          "Volume"],
    ["pp\\.",           "pages"],
    ["p\\.(?=\\s*\\d)", "page"],
    ["approx\\.",       "approximately"],
    ["Inc\\.",          "Incorporated"],
    ["Ltd\\.",          "Limited"],
    ["dept\\.",         "department"]
];

/*=======================================================
  EDIT HERE (3/4) - NUMBERS AT THE START OF A SENTENCE
  "16 For God so loved ..." and "3 Rules for Peace" are read with a full
  stop after the number: "16. For God so loved ...". Not touched:
  a number followed by a lower-case word ("2024 was a good year"), a date
  ("5 November"), and the numbered books below ("1 Peter", "2 Kings").
=======================================================*/
api.numberedBooks=["Samuel","Kings","Chronicles","Corinthians","Thessalonians","Timothy","Peter","John","Esdras","Maccabees",
                   "Sam","Kgs","Chr","Cor","Thess","Tim","Pet","Jn"];
api.months=["January","February","March","April","May","June","July","August","September","October","November","December",
            "Jan","Feb","Mar","Apr","Jun","Jul","Aug","Sep","Sept","Oct","Nov","Dec"];

/*=======================================================
  EDIT HERE (4/4) - GAPS (milliseconds of silence)
  paragraph: after a paragraph, a title, a line that stands on its own,
             or any other forced line break. At the normal speed this is
             about the length of the pause after a full stop.
  The gap is shortened a little when the reader speeds the voice up.
  Set to 0 to switch the extra gap off.
=======================================================*/
api.gaps={paragraph:450};

/*=======================================================
  The machinery (no need to edit below this line)
=======================================================*/

const LET="\\p{L}\\p{N}";
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const cap=(src,out)=>/^\p{Lu}/u.test(src)?out.charAt(0).toUpperCase()+out.slice(1):out;

let compiled=null;
function compile(){
    const alt=list=>"^(?:"+(list||[]).map(esc).join("|")+")$";
    compiled={
        books:new RegExp(alt(api.numberedBooks),"i"),
        months:new RegExp(alt(api.months),"i"),
        words:(api.words||[]).map(w=>({
            re:new RegExp("(^|[^"+LET+"])("+esc(w[0])+")(?![" + LET + "])","giu"),
            say:String(w[1])
        })),
        abbr:(api.abbreviations||[]).map(a=>({
            re:new RegExp("(^|[^"+LET+".])("+a[0]+")(?![" + LET + "])","giu"),
            say:String(a[1]),
            brk:!!(a[2]&&a[2].breakBeforeCapital)
        }))
    };
}
/* call after editing api.words / api.abbreviations at run time (tests do) */
api.recompile=function(){compiled=null;};

function words(t){
    for(const w of compiled.words)t=t.replace(w.re,(m,pre)=>pre+w.say);
    return t;
}

/* a final full stop on an abbreviation is kept when it was also the end of the piece */
function abbreviations(t){
    for(const a of compiled.abbr){
        t=t.replace(a.re,(m,pre,ab,off,str)=>{
            const after=str.slice(off+m.length);
            const dot=/\.$/.test(ab);
            const atEnd=/^\s*$/.test(after)||(a.brk&&/^\s+[\p{Lu}\p{N}]/u.test(after));
            return pre+cap(ab,a.say)+(dot&&atEnd?".":"");
        });
    }
    /* dotted capitals: U.S.A. -> "U S A" */
    t=t.replace(new RegExp("(^|[^"+LET+".])((?:\\p{L}\\.){2,})(?![" + LET + "])","gu"),(m,pre,ab,off,str)=>{
        const after=str.slice(off+m.length);
        const spelled=ab.replace(/\./g," ").trim().toUpperCase();
        return pre+spelled.split("").join(" ")+(/^\s*$/.test(after)?".":"");
    });
    return t;
}

/* a superscript (footnote or verse number) leaves an invisible mark: it becomes a full stop */
function superscripts(t){
    t=t.replace(/\s*⁣\s*(?=[.!?…])/g,"");                  /* a full stop follows anyway */
    t=t.replace(/([.!?…]["')\]”’]*)\s*⁣\s*/g,"$1 ");   /* one already came before */
    return t.replace(/\s*⁣\s*/g,". ");
}

/* "16 For God so loved" -> "16. For God so loved";  "(1) Text" / "1) Text" -> "1. Text" */
function leadingNumber(t){
    const m=t.match(/^\(?(\d{1,4})[.)]?\s+(\p{Lu}[\p{L}]*)/u);
    if(!m)return t;
    const next=m[2];
    if(/^\d$/.test(m[1])&&compiled.books.test(next))return t;      /* 1 Peter, 2 Kings */
    if(compiled.months.test(next))return t;                          /* 5 November */
    return t.replace(/^\(?(\d{1,4})[.)]?\s+/,"$1. ");
}

/* Colons, semicolons and dashes are never said; they separate. A comma gives the
   short, even pause that every voice understands. Times and verses (10:30, 3:16)
   have no space after the colon and are left to the voice. */
function separators(t,atEnd){
    t=t.replace(/(\d)\s*–\s*(\d)/g,"$1\u0001$2");              /* 5-10 (en dash between numbers) */
    t=t.replace(/\s*(?:--+|[–—―])\s*/g,", ");         /* dashes, long and short */
    t=t.replace(/\s+-\s+/g,", ");                                    /* a spaced hyphen */
    t=t.replace(/\s*:\s+/g,", ");
    t=t.replace(/\s*:(?=\p{L})/gu,", ");                             /* "Note:Hello" */
    t=t.replace(/\s*;\s*/g,", ");
    t=t.replace(/\s*:\s*$/,atEnd?".":",");
    t=t.replace(/(\s*,){2,}/g,",");
    t=t.replace(/([.!?…])\s*,/g,"$1");
    t=t.replace(/^[\s,]+/,"");
    t=t.replace(/\u0001/g," to ");
    return t;
}

const INTRO=/^(however|therefore|then|thus|hence|so|now|yes|no|well|also|indeed|moreover|furthermore|meanwhile|instead|finally|first|second|third|next|later|today|tomorrow|yesterday|in|on|at|by|for|with|from|to|of|after|before|when|while|if|as|although|though|because|since|once|until|unless|during|through|under|over|between|among|without|within|about|against|despite|whenever|where|whether|and|but|or|nor|yet)\b/i;
const count=s=>s.trim().split(/\s+/).filter(Boolean).length;

/* "apples, pears and oranges" -> "apples, pears, and oranges".
   Only short list-like pieces are touched, and never a sentence that opens with an
   introductory word or phrase ("However, he and she ..."): that comma is not a list. */
function serialComma(t){
    const parts=t.split(", ");
    if(parts.length<2)return t;
    if(INTRO.test(parts[0].trim()))return t;
    for(let k=1;k<parts.length;k++){
        const m=parts[k].match(/^(.+?)\s+(and|or)\s+(.+)$/i);
        if(!m||count(m[1])>3||count(m[3])>5)continue;
        if(k===1&&count(parts[0])>6)continue;
        let listy=true;
        for(let j=1;j<k;j++)if(count(parts[j])>3){listy=false;break;}
        if(!listy)continue;
        parts[k]=m[1]+", "+m[2]+" "+m[3];
    }
    return parts.join(", ");
}

/*
 * text : one sentence-sized piece, as readAloud.js cut it
 * opts : {end:true} when the piece is the last of its paragraph (it then always ends in a full stop)
 * returns the text to hand to the voice
 */
api.spoken=function(text,opts){
    let t=String(text==null?"":text);
    if(!t)return t;
    if(!compiled)compile();
    const atEnd=!!(opts&&opts.end);
    t=superscripts(t);
    t=leadingNumber(t.trim());
    t=words(t);
    t=abbreviations(t);
    t=separators(t,atEnd);
    t=serialComma(t);
    t=t.replace(/\s+([,.!?])/g,"$1").replace(/\s+/g," ").trim();
    if(atEnd)t=t.replace(/\s*[,;:—–-]+$/,".");
    return t;
};

return api;

})();
