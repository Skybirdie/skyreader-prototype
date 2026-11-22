"use strict";

/*
=========================================================
 Sky Slide Show Transition Registry

 All slide changes go through this registry. New transitions
 can later be added without changing the viewer's navigation
 or playback logic.
=========================================================
*/
window.SlideshowTransitions=(function(){
    const registry={};
    let active="fade";
    function register(name,transition){if(name&&typeof transition==="function")registry[name]=transition;}
    function set(name){if(registry[name])active=name;return active;}
    function current(){return active;}
    function names(){return Object.keys(registry);}
    function run(context){
        const fn=registry[active]||registry.fade;
        return fn(context);
    }
    /*
     * Cross fade.
     *
     * The incoming slide fades IN on top of the outgoing slide while the
     * outgoing slide stays fully opaque underneath. The outgoing slide only
     * starts to fade out late in the fade, once the incoming slide already
     * covers most of the stage. Fading both slides at the same time lets the
     * dark stage show through in the middle (a "blink").
     */
    const FADE_IN_MS=650;
    const FADE_OUT_MS=250;
    const FADE_OUT_DELAY_MS=400;

    register("fade",({stage,oldSlide,newSlide,done})=>{
        if(!newSlide){done&&done();return;}

        newSlide.style.transition="none";
        newSlide.style.opacity="0";
        newSlide.style.zIndex="2";
        newSlide.classList.add("is-transitioning-in");

        if(oldSlide){
            oldSlide.style.transition="none";
            oldSlide.style.opacity="1";
            oldSlide.style.zIndex="1";
            oldSlide.classList.add("is-transitioning-out");
        }

        // Force a reflow so the browser commits opacity:0 first. Without
        // this the starting value can be skipped and the new slide pops in.
        void newSlide.offsetWidth;

        newSlide.style.transition="opacity "+FADE_IN_MS+"ms ease-in-out";
        newSlide.style.opacity="1";

        if(oldSlide){
            oldSlide.style.transition="opacity "+FADE_OUT_MS+"ms ease-in "+FADE_OUT_DELAY_MS+"ms";
            oldSlide.style.opacity="0";
        }

        window.setTimeout(()=>{
            if(oldSlide){oldSlide.remove();}
            newSlide.classList.remove("is-transitioning-in");
            newSlide.style.transition="";
            newSlide.style.zIndex="";
            newSlide.style.opacity="1";
            done&&done();
        },FADE_IN_MS+40);
    });
    return {register,set,current,names,run};
})();
