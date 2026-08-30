"use strict";

/*
=========================================================
 Video Viewer Glide Contract Adapter — C2.2 / VV2

 Purpose:
   Receive a Video Contract from Glide through ?contractz=
   and normalize it into clean Video objects.

 Contract:

 {
   "id": "",
   "title": "",
   "subtitle": "unknown",
   "thumbnail": "",
   "video": "",
   "author": "unknown",
   "category": "unknown",
   "videoLength": "unknown",
   "date": "YYYYMMDDHHMM"
 }

 C2.2 transport:
   ?contractz=vv2.<compressed-payload>

 Compatibility:
   - JSON arrays
   - Single JSON object
   - { ... }, { ... } compact Glide format
   - Glide-wrapped quotation marks
   - Doubled quotation marks
   - Glide Markdown URLs:
       [https://example.com/file.mp4](https://example.com/file.mp4)

 The underlying C2.2 compressor/decompressor is compatible
 with SkyReader's existing transport codec.
=========================================================
*/

window.VideoGlideContract=(function(){

const adapter={};


/*-------------------------------------------------------
 Video URL normalization

 Glide may convert a URL into Markdown:

   [https://example.com/video.mp4](https://example.com/video.mp4)

 Convert this back to:

   https://example.com/video.mp4

 Ordinary URLs are left untouched.
-------------------------------------------------------*/

function normalizeUrl(value){

    if(value===undefined || value===null){
        return "";
    }

    let url=String(value).trim();

    if(!url){
        return "";
    }


    // Remove surrounding quotation marks if present.
    if(
        url.length>=2 &&
        url.startsWith('"') &&
        url.endsWith('"')
    ){
        url=url.slice(1,-1).trim();
    }


    // Glide Markdown link:
    //
    // [URL](URL)
    //
    // The URL may contain characters such as :, /, ?, &, =, etc.
    const markdownMatch=url.match(
        /^\[([^\]]+)\]\(([^)]+)\)$/
    );

    if(markdownMatch){

        const label=markdownMatch[1].trim();
        const target=markdownMatch[2].trim();

        // Prefer the actual link target.
        return target || label;
    }


    return url;
}


/*-------------------------------------------------------
 Date normalization

 The Video Contract uses:

   YYYYMMDDHHMM

 We do not attempt to reinterpret arbitrary human-readable
 dates here. The contract should provide the established
 sortable format.

 This function simply trims the value.
-------------------------------------------------------*/

function normalizeDate(value){

    if(value===undefined || value===null){
        return "";
    }

    return String(value).trim();
}


/*-------------------------------------------------------
 Shared Video Adapter

 Every source -- Glide contract or future prototype
 manifest -- passes through this normalization boundary
 before the rest of the Video Viewer sees the videos.
-------------------------------------------------------*/

function normalizeVideo(raw={},index=0){

    const source=(
        raw &&
        typeof raw==="object"
    ) ? raw : {};


    const fallbackId="video_"+index;


    return {

        id:
            String(
                source.id ??
                fallbackId
            ).trim() || fallbackId,


        title:
            String(
                source.title ??
                ""
            ).trim(),


        subtitle:
            String(
                source.subtitle ??
                ""
            ).trim(),


        thumbnail:
            normalizeUrl(
                source.thumbnail ??
                source.cover ??
                ""
            ) || "assets/default-thumbnail.png",


        video:
            normalizeUrl(
                source.video ??
                source.url ??
                source.videoUrl ??
                ""
            ),


        author:
            String(
                source.author ??
                ""
            ).trim(),


        category:
            String(
                source.category ??
                ""
            ).trim(),


        videoLength:
            source.videoLength ??
            source.video_length ??
            source.duration ??
            "unknown",


        date:
            normalizeDate(
                source.date ??
                ""
            )

    };

}


/*-------------------------------------------------------
 Manifest normalization

 Supports either:

   [...]
   
or:

   {
      "videos":[...],
      "background":"..."
   }

 This mirrors SkyReader's normalizeManifest().
-------------------------------------------------------*/

function normalizeManifest(rawManifest){

    if(
        !rawManifest ||
        typeof rawManifest!=="object"
    ){
        throw new Error("Invalid video manifest.");
    }


    const rawVideos=
        Array.isArray(rawManifest)
            ? rawManifest
            : rawManifest.videos;


    if(!Array.isArray(rawVideos)){

        throw new Error(
            "Manifest missing videos."
        );

    }


    const videos=rawVideos.map(
        (video,index)=>{

            const normalized=
                normalizeVideo(
                    video,
                    index
                );


            if(!normalized.title){

                throw new Error(
                    "Video title missing."
                );

            }


            if(!normalized.video){

                throw new Error(
                    normalized.title +
                    " has no video source."
                );

            }


            return normalized;

        }
    );


    return {

        videos,

        background:
            Array.isArray(rawManifest)
                ? null
                : (
                    rawManifest.background ??
                    null
                )

    };

}


adapter.normalizeVideo=normalizeVideo;
adapter.normalizeManifest=normalizeManifest;


/*-------------------------------------------------------
 Global contract sources

 These are retained for compatibility with the
 SkyReader pattern and allow future integrations to
 inject the contract without using the URL.
-------------------------------------------------------*/

function readGlobal(){

    const candidates=[

        window.VideoViewerGlideContract,

        window.VideoContract,

        window.GLIDE_VIDEO_CONTRACT

    ];


    for(const value of candidates){

        if(
            value!==undefined &&
            value!==null &&
            value!==""
        ){

            return value;

        }

    }


    return null;

}


/*-------------------------------------------------------
 Normal uncompressed query parameters

 Compatibility with:

   ?contract=
   ?videos=

 The main Phase 2 transport will use ?contractz=.
-------------------------------------------------------*/

function readQuery(){

    try{

        const params=
            new URLSearchParams(
                window.location.search
            );


        const value=
            params.get("contract") ||
            params.get("videos");


        return (
            value &&
            value.trim()
        ) ? value : null;


    }catch(error){

        console.warn(
            "Unable to read Video contract query parameter.",
            error
        );


        return null;

    }

}


/*-------------------------------------------------------
 C2.2 compressed query parameter
-------------------------------------------------------*/

function readCompressedQuery(){

    try{

        const params=
            new URLSearchParams(
                window.location.search
            );


        const value=
            params.get("contractz");


        return (
            value &&
            value.trim()
        ) ? value : null;


    }catch(error){

        console.warn(
            "Unable to read compressed Video contract query parameter.",
            error
        );


        return null;

    }

}


/*-------------------------------------------------------
 Parse manifest object
-------------------------------------------------------*/

function parseObject(value){

    if(Array.isArray(value)){

        return {
            videos:value
        };

    }


    if(
        value &&
        typeof value==="object" &&
        Array.isArray(value.videos)
    ){

        return value;

    }


    throw new Error(
        "Video contract object is missing videos."
    );

}


/*-------------------------------------------------------
 Parse JSON text
-------------------------------------------------------*/

function parseJsonText(text){

    try{

        return parseObject(
            JSON.parse(text)
        );

    }catch(error){

        return null;

    }

}


/*-------------------------------------------------------
 Parse general contract value
-------------------------------------------------------*/

function parse(value){

    if(
        value &&
        typeof value==="object"
    ){

        return parseObject(value);

    }


    if(typeof value!=="string"){

        throw new Error(
            "Video contract must be text, an array, or a manifest object."
        );

    }


    const text=value.trim();


    if(!text){

        throw new Error(
            "Video contract is empty."
        );

    }


    const json=
        parseJsonText(text);


    if(json){

        return json;

    }


    return parseCompactText(text);

}


/*-------------------------------------------------------
 Parse Glide compact contract

 Handles:

   { ... }, { ... }

 instead of:

   [ { ... }, { ... } ]

 Also handles:

   "" → "

 and compact property names.
-------------------------------------------------------*/

function parseCompactText(text){

    let normalized=text.trim();


    // Glide may double quotation marks.
    normalized=
        normalized.replace(
            /""/g,
            '"'
        );


    // Convert compact property names:
    //
    // {id:"123",title:"Example"}
    //
    // into:
    //
    // {"id":"123","title":"Example"}

    normalized=
        normalized.replace(
            /([{,])\s*([A-Za-z_$][\w$]*)\s*:/g,
            '$1"$2":'
        );


    // Add array wrapper when Glide supplied:
    //
    // {...}, {...}
    //
    if(normalized[0]!=="["){

        normalized=
            "[" +
            normalized +
            "]";

    }


    const parsed=
        parseJsonText(normalized);


    if(!parsed){

        throw new Error(
            "Unable to parse Glide Video contract. " +
            "Expected JSON or the compact Glide Video contract format."
        );

    }


    return parsed;

}


/*-------------------------------------------------------
 C2.2 LZ-style byte transport

 Format after Base64URL decoding:

   bytes[0] = version 2

 then repeated groups of 8 tokens:

   1 flag byte

 flag bit:
   0 = literal (1 byte)
   1 = match   (2 bytes)

 Match:
   12-bit offset
   4-bit length

 Match length:
   3..18

 Offset:
   1..4095

 UTF-8 is handled using TextEncoder/TextDecoder.
-------------------------------------------------------*/

const CODEC_VERSION=2;


/*-------------------------------------------------------
 Base64URL encode
-------------------------------------------------------*/

function base64UrlEncode(bytes){

    let binary="";

    const chunk=0x8000;


    for(
        let i=0;
        i<bytes.length;
        i+=chunk
    ){

        binary+=String.fromCharCode(
            ...bytes.subarray(
                i,
                Math.min(
                    i+chunk,
                    bytes.length
                )
            )
        );

    }


    return btoa(binary)
        .replace(/\+/g,"-")
        .replace(/\//g,"_")
        .replace(/=+$/g,"");

}


/*-------------------------------------------------------
 Base64URL decode
-------------------------------------------------------*/

function base64UrlDecode(text){

    const normalized=
        text
            .replace(/-/g,"+")
            .replace(/_/g,"/");


    const padded=
        normalized +
        "=".repeat(
            (4-normalized.length%4)%4
        );


    const binary=
        atob(padded);


    const bytes=
        new Uint8Array(
            binary.length
        );


    for(
        let i=0;
        i<binary.length;
        i++
    ){

        bytes[i]=
            binary.charCodeAt(i);

    }


    return bytes;

}


/*-------------------------------------------------------
 C2.2 compressor

 Included for symmetry and future use.

 The Video Viewer normally only needs decompression.
-------------------------------------------------------*/

function compressBytes(input){

    const out=[
        CODEC_VERSION
    ];


    const windowSize=4095;
    const maxLen=18;
    const minLen=3;


    const candidates=
        new Map();


    let pos=0;

    let flags=0;
    let flagBit=0;
    let flagIndex=-1;
    let tokenBytes=[];


    function flush(){

        if(flagIndex<0){
            return;
        }


        out[flagIndex]=flags;


        for(
            const b of tokenBytes
        ){

            out.push(b);

        }


        flags=0;
        flagBit=0;
        flagIndex=-1;
        tokenBytes=[];

    }


    function keyAt(i){

        return (
            input[i] +
            "," +
            input[i+1] +
            "," +
            input[i+2]
        );

    }


    function addCandidate(i){

        if(i+2>=input.length){
            return;
        }


        const key=keyAt(i);


        let list=
            candidates.get(key);


        if(!list){

            list=[];

            candidates.set(
                key,
                list
            );

        }


        list.push(i);


        if(list.length>24){

            list.shift();

        }

    }


    while(
        pos<input.length
    ){

        if(flagIndex<0){

            flagIndex=
                out.length;

            out.push(0);

        }


        let bestLen=0;
        let bestOffset=0;


        if(
            pos+minLen<=input.length
        ){

            const list=
                candidates.get(
                    keyAt(pos)
                );


            if(list){

                for(
                    let n=list.length-1;
                    n>=0;
                    n--
                ){

                    const start=
                        list[n];


                    const offset=
                        pos-start;


                    if(
                        offset<=0 ||
                        offset>windowSize
                    ){

                        continue;

                    }


                    let len=3;


                    while(
                        len<maxLen &&
                        pos+len<input.length &&
                        input[start+len]===
                        input[pos+len]
                    ){

                        len++;

                    }


                    if(len>bestLen){

                        bestLen=len;
                        bestOffset=offset;


                        if(
                            len===maxLen
                        ){

                            break;

                        }

                    }

                }

            }

        }


        if(
            bestLen>=minLen
        ){

            flags |=
                (1<<flagBit);


            const packed=
                ((bestOffset-1)<<4) |
                (bestLen-maxLen+15);


            tokenBytes.push(
                (packed>>>8)&255,
                packed&255
            );


            for(
                let i=0;
                i<bestLen;
                i++
            ){

                addCandidate(
                    pos+i
                );

            }


            pos+=bestLen;

        }else{

            tokenBytes.push(
                input[pos]
            );


            addCandidate(pos);

            pos++;

        }


        flagBit++;


        if(
            flagBit===8
        ){

            flush();

        }

    }


    flush();


    return new Uint8Array(out);

}


/*-------------------------------------------------------
 C2.2 decompressor

 This matches SkyReader's decoder.
-------------------------------------------------------*/

function decompressBytes(input){

    if(
        !input.length ||
        input[0]!==CODEC_VERSION
    ){

        throw new Error(
            "Unsupported Video contractz version."
        );

    }


    const out=[];

    let p=1;


    while(
        p<input.length
    ){

        const flags=
            input[p++];


        for(
            let bit=0;
            bit<8 &&
            p<input.length;
            bit++
        ){

            if(
                flags &
                (1<<bit)
            ){

                if(
                    p+1>=input.length
                ){

                    throw new Error(
                        "Invalid compressed Video contract."
                    );

                }


                const packed=
                    (input[p++]<<8) |
                    input[p++];


                const offset=
                    (packed>>>4)+1;


                const len=
                    (packed&15)+3;


                const start=
                    out.length-offset;


                if(start<0){

                    throw new Error(
                        "Invalid compressed Video contract offset."
                    );

                }


                for(
                    let i=0;
                    i<len;
                    i++
                ){

                    out.push(
                        out[
                            start+i
                        ]
                    );

                }

            }else{

                out.push(
                    input[p++]
                );

            }

        }

    }


    return new Uint8Array(out);

}


/*-------------------------------------------------------
 Encode compressed text
-------------------------------------------------------*/

function encodeCompressed(text){

    const bytes=
        new TextEncoder().encode(
            text
        );


    return base64UrlEncode(
        compressBytes(bytes)
    );

}


/*-------------------------------------------------------
 Decode compressed text
-------------------------------------------------------*/

function decodeCompressed(payload){

    const bytes=
        base64UrlDecode(
            payload
        );


    return new TextDecoder().decode(
        decompressBytes(bytes)
    );

}


/*-------------------------------------------------------
 Parse compressed contract

 Expected:

   vv2.<payload>

 The decoder also tolerates a raw payload for internal use.
-------------------------------------------------------*/

function parseCompressed(text){

    const payload=
        text.replace(
            /^vv2\./,
            ""
        );


    const json=
        decodeCompressed(
            payload
        );


    const parsed=
        parseJsonText(json);


    if(parsed){

        return parsed;

    }


    return parseCompactText(json);

}


/*-------------------------------------------------------
 Adapter availability
-------------------------------------------------------*/

adapter.available=function(){

    return (
        readGlobal()!==null ||
        readQuery()!==null ||
        readCompressedQuery()!==null
    );

};


/*-------------------------------------------------------
 Load Video Contract
-------------------------------------------------------*/

adapter.load=async function(){

    const global=
        readGlobal();


    if(global!==null){

        return parse(global);

    }


    const compressed=
        readCompressedQuery();


    if(compressed!==null){

        return parseCompressed(
            compressed
        );

    }


    const value=
        readQuery();


    if(value===null){

        return null;

    }


    return parse(value);

};


/*-------------------------------------------------------
 Codec interface

 Produces:

   vv2.<compressed payload>

 This is the Video equivalent of SkyReader's:

   sr2.<compressed payload>
-------------------------------------------------------*/

adapter.codec={

    encode:function(value){

        const text=
            typeof value==="string"
                ? value
                : JSON.stringify(value);


        return (
            "vv2." +
            encodeCompressed(text)
        );

    },


    decode:function(payload){

        const text=
            payload.replace(
                /^vv2\./,
                ""
            );


        return decodeCompressed(
            text
        );

    }

};


/*-------------------------------------------------------
 Expose URL normalization for the Video Viewer.

 This allows other Video components to normalize a URL
 without duplicating Glide-specific Markdown handling.
-------------------------------------------------------*/

adapter.normalizeUrl=normalizeUrl;


/*-------------------------------------------------------
 Return adapter
-------------------------------------------------------*/

return adapter;

})();