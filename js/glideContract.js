"use strict";

/*
=========================================================

 SkyReader Glide Contract Adapter — C2.1

 Responsibilities

 • Accept the book contract supplied by Glide
 • Accept standard JSON and the legacy compact/doubled-quote Glide text
 • Accept JSON text that Glide has wrapped in an additional pair of quotes
 • Decode URL-query transport safely
 • Return the same raw manifest shape used by Manifest
 • Keep Glide-specific input handling outside the engine

 Supported input locations

 1. window.SkyReaderGlideContract
 2. window.SkyReaderContract
 3. window.GLIDE_BOOK_CONTRACT
 4. URL query parameter: ?contract=...
 5. URL query parameter: ?books=...

 Preferred Glide payload:

 [{"id":"","title":"Book",...,"date":"202608180111"}]

 The adapter also accepts the compact Glide form:

 [{id:"",title:"Book",date:"202608180111"}]

 and the legacy doubled-quote form:

 {id:"""",title:""Book"",date:""202608180111""}

 No eval() is used.

=========================================================
*/

window.GlideContract=(function(){

const adapter={};

function readGlobal(){

    const candidates=[
        window.SkyReaderGlideContract,
        window.SkyReaderContract,
        window.GLIDE_BOOK_CONTRACT
    ];

    for(const value of candidates){

        if(value!==undefined && value!==null && value!==""){

            return value;

        }

    }

    return null;

}

function readQuery(){

    try{

        const params=new URLSearchParams(window.location.search);

        const value=params.get("contract") || params.get("books");

        return value && value.trim() ? value : null;

    }
    catch(error){

        console.warn("Unable to read Glide contract query parameter.",error);

        return null;

    }

}

function sourceValue(){

    return readGlobal() || readQuery();

}

function parseObject(value){

    if(Array.isArray(value)){

        return {books:value};

    }

    if(value && typeof value==="object" && Array.isArray(value.books)){

        return value;

    }

    throw new Error("Glide contract object is missing books.");

}

function parseJsonValue(value){

    try{

        const parsed=JSON.parse(value);

        /*
           Glide can sometimes JSON-encode the contract as a string.
           Unwrap that string once more before treating the value as
           the manifest payload.
        */
        if(typeof parsed==="string"){

            return parseJsonValue(parsed);

        }

        return parseObject(parsed);

    }
    catch(error){

        return null;

    }

}

function stripOuterQuotes(text){

    let value=text.trim();

    /* Remove a single pair of wrapping quotes only. */
    if(value.length>=2 && value[0]==='"' && value[value.length-1]==='"'){

        value=value.slice(1,-1).trim();

        /* Unescape JSON-style quotes if Glide wrapped JSON as text. */
        value=value.replace(/\\"/g,'"');

    }

    return value;

}

function parseCompactText(text){

    let normalized=stripOuterQuotes(text);

    /* Normalize legacy doubled quotation marks. */
    normalized=normalized.replace(/""/g,'"');

    /* Quote bare object keys. */
    normalized=normalized.replace(
        /([{,])\s*([A-Za-z_$][\w$]*)\s*:/g,
        '$1"$2":'
    );

    /* The Glide column may emit comma-separated objects. */
    if(normalized[0]!=="["){

        normalized="["+normalized+"]";

    }

    const parsed=parseJsonValue(normalized);

    if(!parsed){

        throw new Error(
            "Unable to parse Glide book contract. Expected JSON or the compact Glide contract format."
        );

    }

    return parsed;

}

function parse(value){

    if(value && typeof value==="object"){

        return parseObject(value);

    }

    if(typeof value!=="string"){

        throw new Error(
            "Glide contract must be text, an array, or a manifest object."
        );

    }

    const text=value.trim();

    if(!text){

        throw new Error("Glide contract is empty.");

    }

    /* Preferred format: ordinary JSON. */
    const json=parseJsonValue(text);

    if(json){

        return json;

    }

    /* Backward-compatible support for compact/doubled-quote Glide output. */
    return parseCompactText(text);

}

adapter.available=function(){

    return sourceValue()!==null;

};

adapter.load=async function(){

    const value=sourceValue();

    if(value===null){

        return null;

    }

    return parse(value);

};

return adapter;

})();
