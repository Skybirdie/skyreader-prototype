"use strict";

/*
=========================================================

 SkyReader Audio Manager

 Responsibilities

 • Audio pools
 • Preloading
 • Volume
 • Mute
 • Browser unlock
 • Cached sounds

=========================================================
*/

window.AudioController=(function(){

const audio={};

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

let masterVolume=0.35;

let muted=false;

let unlocked=false;

/*-------------------------------------------------------
  Cache
-------------------------------------------------------*/

const sounds=new Map();

/*-------------------------------------------------------
  Audio Pool
-------------------------------------------------------*/

class AudioPool{

constructor(url,size=4){

this.url=url;

this.index=0;

this.players=[];

for(let i=0;i<size;i++){

const player=new Audio(url);

player.preload="auto";

player.volume=masterVolume;

this.players.push(player);

}

}

next(){

const player=this.players[this.index];

this.index++;

if(this.index>=this.players.length){

this.index=0;

}

return player;

}

play(){

if(muted){

return;

}

const player=this.next();

try{

player.pause();

player.currentTime=0.30;

player.volume=masterVolume;

player.play().catch(()=>{});

}catch(e){}

}

stop(){

this.players.forEach(player=>{

player.pause();

player.currentTime=0;

});

}

setVolume(volume){

this.players.forEach(player=>{

player.volume=volume;

});

}

}

/*-------------------------------------------------------
  Unlock Audio
-------------------------------------------------------*/

function unlock(){

if(unlocked){

return;

}

unlocked=true;

sounds.forEach(pool=>{

const player=pool.next();

player.volume=0;

player.play()

.then(()=>{

player.pause();

player.currentTime=0;

player.volume=masterVolume;

})

.catch(()=>{});

});

}

/*-------------------------------------------------------
  User Interaction
-------------------------------------------------------*/

[
"pointerdown",
"touchstart",
"keydown"
].forEach(eventName=>{

window.addEventListener(

eventName,

unlock,

{

once:true,

passive:true

}

);

});

/*-------------------------------------------------------
  Volume
-------------------------------------------------------*/

audio.setVolume=function(volume){

masterVolume=

Math.max(

0,

Math.min(1,volume)

);

sounds.forEach(pool=>{

pool.setVolume(masterVolume);

});

};

audio.volume=function(){

return masterVolume;

};

/*-------------------------------------------------------
  Mute
-------------------------------------------------------*/

audio.mute=function(){

muted=true;

};

audio.unmute=function(){

muted=false;

};

audio.toggleMute=function(){

muted=!muted;

return muted;

};

audio.isMuted=function(){

return muted;

};


/*-------------------------------------------------------
  Register Sounds
-------------------------------------------------------*/

audio.register=function(name,url,poolSize=4){

if(!name || !url){

return;

}

sounds.set(

name,

new AudioPool(url,poolSize)

);

};

/*-------------------------------------------------------
  Preload
-------------------------------------------------------*/

audio.preload=function(){

sounds.forEach(pool=>{

pool.players.forEach(player=>{

player.load();

});

});

};

/*-------------------------------------------------------
  Playback
-------------------------------------------------------*/

audio.play=function(name){

const pool=sounds.get(name);

if(!pool){

return false;

}

pool.play();

return true;

};

/*-------------------------------------------------------
  Stop
-------------------------------------------------------*/

audio.stop=function(name){

const pool=sounds.get(name);

if(!pool){

return;

}

pool.stop();

};

audio.stopAll=function(){

sounds.forEach(pool=>{

pool.stop();

});

};

/*-------------------------------------------------------
  Pause / Resume
-------------------------------------------------------*/

audio.pauseAll=function(){

sounds.forEach(pool=>{

pool.players.forEach(player=>{

player.pause();

});

});

};

audio.resumeAll=function(){

if(muted){

return;

}

sounds.forEach(pool=>{

pool.players.forEach(player=>{

if(

player.currentTime>0 &&

player.paused

){

player.play().catch(()=>{});

}

});

});

};

/*-------------------------------------------------------
  Registered Sounds
-------------------------------------------------------*/

audio.register(

"pageTurn",

"https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/QFKiEO3I2ZKX7y8dVj5p/pub/xpb3Na1EwmKTy0uIJ6nt/freesound_community-one-page-book-flip-101928.mp3",

5

);

/*-------------------------------------------------------
  Convenience Helpers
-------------------------------------------------------*/

audio.playPageTurn=function(){

audio.play("pageTurn");

};

/*-------------------------------------------------------
  Information
-------------------------------------------------------*/

audio.has=function(name){

return sounds.has(name);

};

audio.list=function(){

return Array.from(

sounds.keys()

);

};

/*-------------------------------------------------------
  Initialization
-------------------------------------------------------*/

audio.initialize=function(){

audio.preload();

};

audio.initialize();

/*-------------------------------------------------------
  Version
-------------------------------------------------------*/

audio.version="1.0.0";


/*-------------------------------------------------------
  Reader Event Integration
-------------------------------------------------------*/

const listeners=new Map();

function emit(event,data){

const list=listeners.get(event);

if(!list){

return;

}

list.forEach(callback=>{

try{

callback(data);

}catch(e){

console.error(e);

}

});

}

audio.on=function(event,callback){

if(!listeners.has(event)){

listeners.set(event,[]);

}

listeners.get(event).push(callback);

};

audio.off=function(event,callback){

if(!listeners.has(event)){

return;

}

const list=listeners.get(event);

const index=list.indexOf(callback);

if(index!==-1){

list.splice(index,1);

}

};

audio.emit=emit;

/*-------------------------------------------------------
  UI Sounds
-------------------------------------------------------*/

audio.playClick=function(){

audio.play("click");

};

audio.playOpen=function(){

audio.play("libraryOpen");

};

audio.playClose=function(){

audio.play("libraryClose");

};

/*-------------------------------------------------------
  Page Turn
-------------------------------------------------------*/

audio.pageTurn=function(direction){

audio.playPageTurn();

emit("pageTurn",{

direction,

time:performance.now()

});

};

/*-------------------------------------------------------
  Reader Notifications
-------------------------------------------------------*/

audio.readerOpened=function(book){

emit("readerOpened",book);

};

audio.readerClosed=function(){

emit("readerClosed");

};

audio.pageChanged=function(page){

emit("pageChanged",page);

};

/*-------------------------------------------------------
  Optional Sounds
-------------------------------------------------------*/

audio.register(

"click",

"assets/audio/click.mp3",

3

);

audio.register(

"libraryOpen",

"assets/audio/open.mp3",

2

);

audio.register(

"libraryClose",

"assets/audio/close.mp3",

2

);

/*-------------------------------------------------------
  Availability
-------------------------------------------------------*/

audio.available=function(name){

return sounds.has(name);

};

/*-------------------------------------------------------
  Future Ambient Stub
-------------------------------------------------------*/

audio.ambient={

playing:false,

name:null,

volume:0,

start(name){

this.name=name;

this.playing=true;

},

stop(){

this.playing=false;

this.name=null;

}

};

/*-------------------------------------------------------
  Fade Helpers
-------------------------------------------------------*/

function fadePlayer(

player,

from,

to,

duration=300

){

const start=performance.now();

function frame(now){

const t=Math.min(

1,

(now-start)/duration

);

player.volume=

from+

(to-from)*t;

if(t<1){

requestAnimationFrame(frame);

}

}

requestAnimationFrame(frame);

}

/*-------------------------------------------------------
  Fade Pool
-------------------------------------------------------*/

audio.fade=function(

name,

target,

duration=300

){

const pool=sounds.get(name);

if(!pool){

return;

}

pool.players.forEach(player=>{

fadePlayer(

player,

player.volume,

target,

duration

);

});

};

/*-------------------------------------------------------
  Ambient Controls
-------------------------------------------------------*/

audio.startAmbient=function(name){

const pool=sounds.get(name);

if(!pool){

return false;

}

const player=pool.next();

player.loop=true;

player.currentTime=0;

player.volume=0;

player.play().catch(()=>{});

fadePlayer(

player,

0,

masterVolume*0.5,

1200

);

audio.ambient.playing=true;

audio.ambient.name=name;

return true;

};

audio.stopAmbient=function(){

if(!audio.ambient.name){

return;

}

const pool=

sounds.get(audio.ambient.name);

if(pool){

pool.players.forEach(player=>{

fadePlayer(

player,

player.volume,

0,

800

);

setTimeout(()=>{

player.pause();

player.currentTime=0;

},800);

});

}

audio.ambient.stop();

};

/*-------------------------------------------------------
  Global Fade
-------------------------------------------------------*/

audio.fadeOutAll=function(duration=500){

sounds.forEach(pool=>{

pool.players.forEach(player=>{

fadePlayer(

player,

player.volume,

0,

duration

);

});

});

};

audio.fadeInAll=function(duration=500){

if(muted){

return;

}

sounds.forEach(pool=>{

pool.players.forEach(player=>{

fadePlayer(

player,

player.volume,

masterVolume,

duration

);

});

});

};

/*-------------------------------------------------------
  Shutdown
-------------------------------------------------------*/

audio.destroy=function(){

audio.stopAmbient();

audio.stopAll();

listeners.clear();

sounds.clear();

};

/*-------------------------------------------------------
  Diagnostics
-------------------------------------------------------*/

audio.statistics=function(){

return{

registered:sounds.size,

muted,

masterVolume,

unlocked,

ambient:audio.ambient.name,

playingAmbient:

audio.ambient.playing

};

};

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return audio;

})();

