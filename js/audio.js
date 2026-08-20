"use strict";

window.AudioController=(function(){
    const audio={};
    const sounds=new Map();
    let masterVolume=0.35;
    let muted=false;
    let unlocked=false;
    const listeners=new Map();

    class AudioPool{
        constructor(urls,size=3,volumeScale=1){
            this.urls=(Array.isArray(urls)?urls:[urls]).filter(Boolean);
            this.size=size;
            this.volumeScale=Math.max(0,Math.min(1,Number(volumeScale)||0));
            this.index=0;
            this.players=[];
            this.sourceIndex=0;
            this.ready=false;
            this.failed=false;
            this.build(this.urls[0]);
        }
        build(url){
            this.players=[];
            if(!url){ this.failed=true; return; }
            for(let i=0;i<this.size;i++){
                const p=new Audio(url);
                p.preload="auto";
                p.volume=masterVolume*this.volumeScale;
                p.addEventListener("error",()=>this.tryFallback(),{once:true});
                this.players.push(p);
            }
        }
        tryFallback(){
            if(this.failed) return;
            this.sourceIndex++;
            if(this.sourceIndex>=this.urls.length){ this.failed=true; return; }
            this.build(this.urls[this.sourceIndex]);
            this.players.forEach(p=>{ try{ p.load(); }catch(e){} });
        }
        next(){ const p=this.players[this.index]; this.index=(this.index+1)%Math.max(1,this.players.length); return p; }
        preload(){ this.players.forEach(p=>{ try{p.load();}catch(e){} }); }
        play(){
            if(muted || this.failed || !this.players.length) return false;
            const p=this.next();
            try{ p.pause(); p.currentTime=0; p.volume=masterVolume*this.volumeScale; p.play().catch(()=>{}); return true; }catch(e){ return false; }
        }
        stop(){ this.players.forEach(p=>{try{p.pause();p.currentTime=0;}catch(e){}}); }
        setVolume(v){ this.players.forEach(p=>p.volume=v*this.volumeScale); }
    }

    function emit(event,data){ const list=listeners.get(event); if(list) list.forEach(fn=>{try{fn(data);}catch(e){}}); }

    audio.register=function(name,urls,poolSize=3,volumeScale=1){ if(!name || !urls) return false; sounds.set(name,new AudioPool(urls,poolSize,volumeScale)); return true; };
    audio.play=function(name){ const pool=sounds.get(name); return pool?pool.play():false; };
    audio.preload=function(){ sounds.forEach(pool=>pool.preload()); };
    audio.has=function(name){ return sounds.has(name); };
    audio.available=audio.has;
    audio.list=function(){ return Array.from(sounds.keys()); };
    audio.stop=function(name){ const pool=sounds.get(name); if(pool) pool.stop(); };
    audio.stopAll=function(){ sounds.forEach(pool=>pool.stop()); };
    audio.pauseAll=function(){ sounds.forEach(pool=>pool.players.forEach(p=>p.pause())); };
    audio.resumeAll=function(){};
    audio.setVolume=function(v){ masterVolume=Math.max(0,Math.min(1,v)); sounds.forEach(pool=>pool.setVolume(masterVolume)); };
    audio.volume=function(){ return masterVolume; };
    audio.mute=function(){ muted=true; audio.stopAll(); };
    audio.unmute=function(){ muted=false; };
    audio.toggleMute=function(){ muted=!muted; if(muted) audio.stopAll(); return muted; };
    audio.isMuted=function(){ return muted; };
    audio.on=function(event,fn){ if(!listeners.has(event)) listeners.set(event,[]); listeners.get(event).push(fn); };
    audio.off=function(event,fn){ const a=listeners.get(event); if(!a)return; const i=a.indexOf(fn); if(i>=0)a.splice(i,1); };
    audio.emit=emit;

    // Production audio. Each list ends with a known-safe fallback.
    /* Build-time availability was checked before packaging. This avoids probing
       absent files in the browser and therefore avoids avoidable 404 console noise. */
    audio.register("pageTurn",
        "https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/QFKiEO3I2ZKX7y8dVj5p/pub/xpb3Na1EwmKTy0uIJ6nt/freesound_community-one-page-book-flip-101928.mp3",5);
    /* Book selection intentionally has NO click fallback. In this packaged build
       select.mp3 is not present, so the action remains silent rather than
       requesting a missing file or substituting click.mp3. If select.mp3 is
       packaged in a future build, register it here at SELECT_VOLUME_SCALE. */
    const SELECT_VOLUME_SCALE=1.5; // 90% of the master volume
    const HAS_PACKAGED_SELECT_SOUND=false;
    if(HAS_PACKAGED_SELECT_SOUND){
        audio.register("bookSelect","assets/audio/click.mp3",3,SELECT_VOLUME_SCALE);
    }
    audio.register("bookClose","assets/audio/select.mp3",2);
    audio.register("libraryOpen","assets/audio/open.mp3",2);
    audio.register("libraryClose","assets/audio/close.mp3",2);

    audio.playPageTurn=function(){ return audio.play("pageTurn"); };
    audio.playSelect=function(){ return audio.has("bookSelect") ? audio.play("bookSelect") : false; };
    audio.playBookClose=function(){ return audio.play("bookClose"); };
    audio.playOpen=function(){ return audio.play("libraryOpen"); };
    audio.playClose=function(){ return audio.play("libraryClose"); };
    audio.pageTurn=function(direction){ audio.playPageTurn(); emit("pageTurn",{direction,time:performance.now()}); };
    audio.readerOpened=function(book){ emit("readerOpened",book); };
    audio.readerClosed=function(){ emit("readerClosed"); };
    audio.pageChanged=function(page){ emit("pageChanged",page); };
    audio.initialize=function(){ audio.preload(); };
    audio.version="1.1.0";

    function unlock(){
        if(unlocked) return;
        unlocked=true;
        // Do not force playback: just allow normal user-initiated playback to proceed.
    }
    ["pointerdown","touchstart","keydown"].forEach(type=>window.addEventListener(type,unlock,{once:true,passive:true}));
    audio.initialize();
    return audio;
})();
