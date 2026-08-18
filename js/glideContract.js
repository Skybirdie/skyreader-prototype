"use strict";

/*
=========================================================
 SkyReader Glide Contract Adapter — C2.2

 C2.1 remains fully supported through ?contract= and ?books=.
 C2.2 adds ?contractz= using a small synchronous LZ-style
 byte compressor so Glide can create the payload without
 needing a third-party library or async code.
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
        if(value!==undefined && value!==null && value!=="") return value;
    }
    return null;
}

function readQuery(){
    try{
        const params=new URLSearchParams(window.location.search);
        const value=params.get("contract") || params.get("books");
        return value && value.trim() ? value : null;
    }catch(error){
        console.warn("Unable to read Glide contract query parameter.",error);
        return null;
    }
}

function readCompressedQuery(){
    try{
        const params=new URLSearchParams(window.location.search);
        const value=params.get("contractz");
        return value && value.trim() ? value : null;
    }catch(error){
        console.warn("Unable to read compressed Glide contract query parameter.",error);
        return null;
    }
}

function sourceValue(){
    return readGlobal() || readQuery();
}

function parseObject(value){
    if(Array.isArray(value)) return {books:value};
    if(value && typeof value==="object" && Array.isArray(value.books)) return value;
    throw new Error("Glide contract object is missing books.");
}

function parseJsonText(text){
    try{
        return parseObject(JSON.parse(text));
    }catch(error){
        return null;
    }
}

function parse(value){
    if(value && typeof value==="object") return parseObject(value);
    if(typeof value!=="string") throw new Error("Glide contract must be text, an array, or a manifest object.");
    const text=value.trim();
    if(!text) throw new Error("Glide contract is empty.");
    const json=parseJsonText(text);
    if(json) return json;
    return parseCompactText(text);
}

function parseCompactText(text){
    let normalized=text.trim();
    normalized=normalized.replace(/""/g,'"');
    normalized=normalized.replace(/([{,])\s*([A-Za-z_$][\w$]*)\s*:/g,'$1"$2":');
    if(normalized[0]!=="[") normalized="["+normalized+"]";
    const parsed=parseJsonText(normalized);
    if(!parsed){
        throw new Error("Unable to parse Glide book contract. Expected JSON or the compact Glide contract format.");
    }
    return parsed;
}

/*-------------------------------------------------------
 C2.2 LZ-style byte transport

 Format after base64url decoding:
   bytes[0] = version 2
   then repeated groups of 8 tokens:
     1 flag byte
     flag bit 0 = literal (1 byte)
     flag bit 0 = match (2 bytes: 12-bit offset + 4-bit length)

 Match length is 3..18 and offset is 1..4095.
 UTF-8 is handled with TextEncoder/TextDecoder.
-------------------------------------------------------*/

const CODEC_VERSION=2;

function base64UrlEncode(bytes){
    let binary="";
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk){
        binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
    }
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

function base64UrlDecode(text){
    const normalized=text.replace(/-/g,"+").replace(/_/g,"/");
    const padded=normalized+"=".repeat((4-normalized.length%4)%4);
    const binary=atob(padded);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes;
}

function compressBytes(input){
    const out=[CODEC_VERSION];
    const windowSize=4095;
    const maxLen=18;
    const minLen=3;
    const candidates=new Map();
    let pos=0;
    let flags=0;
    let flagBit=0;
    let flagIndex=-1;
    let tokenBytes=[];

    function flush(){
        if(flagIndex<0) return;
        out[flagIndex]=flags;
        for(const b of tokenBytes) out.push(b);
        flags=0; flagBit=0; flagIndex=-1; tokenBytes=[];
    }

    function keyAt(i){
        return input[i]+","+input[i+1]+","+input[i+2];
    }

    function addCandidate(i){
        if(i+2>=input.length) return;
        const key=keyAt(i);
        let list=candidates.get(key);
        if(!list){ list=[]; candidates.set(key,list); }
        list.push(i);
        if(list.length>24) list.shift();
    }

    while(pos<input.length){
        if(flagIndex<0){ flagIndex=out.length; out.push(0); }

        let bestLen=0;
        let bestOffset=0;

        if(pos+minLen<=input.length){
            const list=candidates.get(keyAt(pos));
            if(list){
                for(let n=list.length-1;n>=0;n--){
                    const start=list[n];
                    const offset=pos-start;
                    if(offset<=0 || offset>windowSize) continue;
                    let len=3;
                    while(len<maxLen && pos+len<input.length && input[start+len]===input[pos+len]) len++;
                    if(len>bestLen){
                        bestLen=len;
                        bestOffset=offset;
                        if(len===maxLen) break;
                    }
                }
            }
        }

        if(bestLen>=minLen){
            flags|=(1<<flagBit);
            const packed=((bestOffset-1)<<4)|(bestLen-maxLen+15);
            tokenBytes.push((packed>>>8)&255,packed&255);
            for(let i=0;i<bestLen;i++) addCandidate(pos+i);
            pos+=bestLen;
        }else{
            tokenBytes.push(input[pos]);
            addCandidate(pos);
            pos++;
        }

        flagBit++;
        if(flagBit===8) flush();
    }
    flush();
    return new Uint8Array(out);
}

function decompressBytes(input){
    if(!input.length || input[0]!==CODEC_VERSION) throw new Error("Unsupported contractz version.");
    const out=[];
    let p=1;
    while(p<input.length){
        const flags=input[p++];
        for(let bit=0;bit<8 && p<input.length;bit++){
            if(flags&(1<<bit)){
                if(p+1>=input.length) throw new Error("Invalid compressed Glide contract.");
                const packed=(input[p++]<<8)|input[p++];
                const offset=(packed>>>4)+1;
                const len=(packed&15)+3;
                const start=out.length-offset;
                if(start<0) throw new Error("Invalid compressed Glide contract offset.");
                for(let i=0;i<len;i++) out.push(out[start+i]);
            }else{
                out.push(input[p++]);
            }
        }
    }
    return new Uint8Array(out);
}

function encodeCompressed(text){
    const bytes=new TextEncoder().encode(text);
    return base64UrlEncode(compressBytes(bytes));
}

function decodeCompressed(payload){
    const bytes=base64UrlDecode(payload);
    return new TextDecoder().decode(decompressBytes(bytes));
}

function parseCompressed(text){
    const json=decodeCompressed(text.replace(/^sr2\./,""));
    const parsed=parseJsonText(json);
    if(parsed) return parsed;
    return parseCompactText(json);
}

adapter.available=function(){
    return readGlobal()!==null || readQuery()!==null || readCompressedQuery()!==null;
};

adapter.load=async function(){
    const global=readGlobal();
    if(global!==null) return parse(global);

    const compressed=readCompressedQuery();
    if(compressed!==null) return parseCompressed(compressed);

    const value=readQuery();
    if(value===null) return null;
    return parse(value);
};

adapter.codec={
    encode:function(value){
        const text=typeof value==="string" ? value : JSON.stringify(value);
        return "sr2."+encodeCompressed(text);
    },
    decode:function(payload){
        const text=payload.replace(/^sr2\./,"");
        return decodeCompressed(text);
    }
};

return adapter;

})();
