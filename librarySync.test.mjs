/*
 * LibrarySync + the Front Page "open" hand-offs.   node librarySync.test.mjs
 * Runs the real js/librarySync.js, js/frontMediaRenderer.js and js/frontPage.js
 * against small stand-ins for the browser and the section libraries.
 */
import fs from "node:fs";
import vm from "node:vm";

let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); if (!ok) failures++; };
const read = f => fs.readFileSync(new URL("./js/" + f, import.meta.url), "utf8");

/* ---------- generic chainable DOM element stand-in ---------- */
function makeEl(tag = "div") {
  const el = {
    tagName: tag, children: [], dataset: {}, style: {}, _l: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this["@" + k] = v; }, getAttribute(k) { return this["@" + k]; },
    addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); },
    prepend(...c) { this.children.unshift(...c); }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, play() { return Promise.resolve(); }, pause() {}, load() {},
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; },
    set innerHTML(v) { this.children = []; }, get innerHTML() { return ""; },
    contentWindow: null, parentNode: null
  };
  return el;
}
function walk(el, fn) { fn(el); (el.children || []).forEach(c => walk(c, fn)); }

/* ---------- build an environment ---------- */
function env({ videoHeld = [], videoReleased = [], slideHeld = [], slideReleased = [], bookHeld = [], bookReleased = [],
               viewerOpens = true, sections = {} } = {}) {
  const log = { videoLoads: [], slideLoads: [], selects: [], fullscreen: [], shows: [], builds: 0, orgs: 0, timers: [] };
  const doc = {
    fullscreenElement: null,
    createElement: makeEl, createElementNS: () => makeEl("svg"),
    getElementById: id => {
      if (id === "videoViewer" || id === "slideshowViewer") {
        const v = makeEl(); v.requestFullscreen = () => { log.fullscreen.push(id); return Promise.resolve(); }; return v;
      }
      return makeEl();
    },
    addEventListener() {}, documentElement: makeEl()
  };
  let videoCur = null, slideCur = null;
  const ctx = {
    document: doc, addEventListener() {}, dispatchEvent() { return true; }, console: { ...console, log() {}, info() {}, warn() {}, error() {} },
    requestAnimationFrame: f => f(), setTimeout: (f, ms) => { log.timers.push({ f, ms }); return log.timers.length; }, clearTimeout() {},
    ResizeObserver: class { observe() {} disconnect() {} }, Promise, Date, JSON, Array, Object, String, Number, Math, Error, Set, Map, URL, Boolean,
    SkyReader: { library: bookHeld, filteredLibrary: [...bookHeld] }
  };
  /* like a browser: window IS the global object */
  ctx.globalThis = ctx; ctx.self = ctx; ctx.window = ctx;
  const win = ctx;
  const expose = (name, obj) => { ctx[name] = obj; };
  expose("SkyReader", ctx.SkyReader);
  expose("ContentContract", { isYouTubeUrl: u => /youtube/.test(u), toYouTubeEmbedUrl: u => u });
  expose("Manifest", { videos: () => videoReleased, slideshows: () => slideReleased, books: () => bookReleased });
  expose("VideoLibrary", {
    getVideos: () => videoHeld,
    load(list) { log.videoLoads.push(list); videoHeld = [...list]; },
    select(id) { const v = videoHeld.find(x => x.id === id); if (!v) return; log.selects.push("video:" + id); if (viewerOpens) videoCur = v; }
  });
  expose("VideoViewer", { getCurrentVideo: () => videoCur });
  expose("SlideshowLibrary", {
    getSlideshows: () => slideHeld,
    load(list) { log.slideLoads.push(list); slideHeld = [...list]; },
    select(id) { const v = slideHeld.find(x => x.id === id); if (!v) return; log.selects.push("slideshow:" + id); if (viewerOpens) slideCur = v; }
  });
  expose("SlideshowViewer", { getCurrent: () => slideCur });
  expose("Library", { applyOrganization() { log.orgs++; }, build() { log.builds++; },
    open(id) { if (!ctx.SkyReader.library.find(b => b.id === id)) return; log.selects.push("reader:" + id); },
    select(b) { log.selects.push("reader:" + b.id); } });
  expose("AppSwitcher", { show(s) { log.shows.push(s); } });
  const vmctx = vm.createContext(ctx);
  const run = f => vm.runInContext(read(f), vmctx, { filename: f });
  return { ctx, win, doc, log, run, get videoHeld() { return videoHeld; }, get slideHeld() { return slideHeld; }, get bookHeld() { return ctx.SkyReader.library; } };
}

const vid = id => ({ id, title: id, video: "https://www.youtube.com/watch?v=aaaaaaaaaaa" });

/* =================== LibrarySync unit tests =================== */
{
  const e = env({ videoHeld: [vid("v1")], videoReleased: [vid("v1"), vid("v2")] });
  e.run("librarySync.js");
  const S = e.win.LibrarySync;

  check("held item -> true, library NOT reloaded", S.ensure("video", "v1") === true && e.log.videoLoads.length === 0);
  check("item released after startup -> library reloaded from the Manifest, true",
    S.ensure("video", "v2") === true && e.log.videoLoads.length === 1 && e.videoHeld.some(v => v.id === "v2"));
  check("after the reload it is held, so no second reload", S.ensure("video", "v2") === true && e.log.videoLoads.length === 1);
  check("item not released -> false, no reload", S.ensure("video", "nope") === false && e.log.videoLoads.length === 1);
  check("numeric vs string id tolerated", S.ensure("video", 1) === false && S.ensure("video", "v1") === true);
  check("empty / missing id -> false", S.ensure("video", "") === false && S.ensure("video", undefined) === false && S.ensure("bogus", "v1") === false);
}
{
  const e = env({ slideHeld: [], slideReleased: [{ id: "s9" }] });
  e.run("librarySync.js");
  check("slideshow: new release reloads SlideshowLibrary", e.win.LibrarySync.ensure("slideshow", "s9") === true && e.log.slideLoads.length === 1);
}
{
  const e = env({ bookHeld: [{ id: "b1" }], bookReleased: [{ id: "b1" }, { id: "b2" }] });
  e.run("librarySync.js");
  check("reader: new release reloads SkyReader.library and rebuilds the shelf",
    e.win.LibrarySync.ensure("reader", "b2") === true && e.bookHeld.length === 2 && e.ctx.SkyReader.filteredLibrary.length === 2 && e.log.orgs === 1 && e.log.builds === 1);
  check("reader: held book -> no rebuild", e.win.LibrarySync.ensure("reader", "b1") === true && e.log.builds === 1);
}
{
  const e = env({ videoHeld: [], videoReleased: [vid("v2")] });
  e.run("librarySync.js");
  e.win.VideoLibrary.load = () => { throw new Error("boom"); };
  e.ctx.VideoLibrary = e.win.VideoLibrary;
  check("a failing reload never throws, returns false", e.win.LibrarySync.ensure("video", "v2") === false);
  delete e.win.VideoLibrary; delete e.ctx.VideoLibrary;
  check("library module missing -> false, no throw", e.win.LibrarySync.ensure("video", "v2") === false);
}
{
  const e = env({ videoHeld: [vid("v1")], videoReleased: [vid("v1")] });
  e.run("librarySync.js");
  const S = e.win.LibrarySync;
  check("isOpen: nothing open -> false", S.isOpen("video", "v1") === false);
  e.win.VideoLibrary.select("v1");
  check("isOpen: that video open -> true; another id -> false", S.isOpen("video", "v1") === true && S.isOpen("video", "v2") === false);
  delete e.win.VideoViewer; delete e.ctx.VideoViewer;
  check("isOpen: viewer cannot say -> null (old behaviour kept)", S.isOpen("video", "v1") === null && S.isOpen("bogus", "v1") === null);
}

/* ============ "Open full viewer" (FrontMediaRenderer.openFull) ============ */
function clickOpenFull(e, item) {
  e.run("frontMediaRenderer.js");
  const host = makeEl(); host.id = "frontMediaHost";
  e.win.FrontMediaRenderer.init(host);
  e.win.FrontMediaRenderer.render(item);
  let btn = null;
  walk(host, n => { if (n.title === "Open full viewer") btn = n; });
  if (!btn) throw new Error("open-full control not found");
  btn._l.click.forEach(f => f({ preventDefault() {}, stopPropagation() {} }));
  e.log.timers.splice(0).forEach(t => t.f());           // the 100 ms fullscreen step
}
const frontVideo = id => ({ id, section: "video", title: id, thumbnail: "", raw: vid(id), category: "Meditation", date: "202611280000", video: "https://www.youtube.com/watch?v=aaaaaaaaaaa", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" });

{ // the reported bug: centerpiece released after the tab loaded
  const e = env({ videoHeld: [vid("old")], videoReleased: [vid("old"), vid("new")] });
  e.run("librarySync.js");
  clickOpenFull(e, frontVideo("new"));
  check("BUG CASE: new centerpiece video is opened (library was refreshed first)", e.log.selects.includes("video:new") && e.log.videoLoads.length === 1);
  check("BUG CASE: and it then goes fullscreen", e.log.fullscreen.join() === "videoViewer", e.log.fullscreen.join());
}
{ // same click WITHOUT the fix (LibrarySync not loaded) shows the original failure
  const e = env({ videoHeld: [vid("old")], videoReleased: [vid("old"), vid("new")] });
  clickOpenFull(e, frontVideo("new"));
  check("baseline without LibrarySync reproduces it: nothing opened, but viewer still fullscreened (black screen)",
    e.log.selects.length === 0 && e.log.fullscreen.join() === "videoViewer", e.log.selects.join() + "|" + e.log.fullscreen.join());
}
{ // item that can never open: no black fullscreen
  const e = env({ videoHeld: [vid("old")], videoReleased: [vid("old")] });
  e.run("librarySync.js");
  clickOpenFull(e, frontVideo("ghost"));
  check("unopenable item -> NOT fullscreened (no black screen)", e.log.selects.length === 0 && e.log.fullscreen.length === 0, e.log.fullscreen.join());
}
{ // normal case stays unchanged
  const e = env({ videoHeld: [vid("a")], videoReleased: [vid("a")] });
  e.run("librarySync.js");
  clickOpenFull(e, frontVideo("a"));
  check("normal case: opens, fullscreens, no library reload", e.log.selects.join() === "video:a" && e.log.fullscreen.join() === "videoViewer" && e.log.videoLoads.length === 0);
}
{ // viewer that cannot report -> old behaviour (still fullscreens)
  const e = env({ videoHeld: [vid("a")], videoReleased: [vid("a")] });
  e.run("librarySync.js");
  delete e.win.VideoViewer; delete e.ctx.VideoViewer;
  clickOpenFull(e, frontVideo("a"));
  check("viewer cannot report open state -> behaves as before (fullscreens)", e.log.fullscreen.join() === "videoViewer");
}
{ // slideshow, same pattern
  const slide = id => ({ id, section: "slideshow", title: id, thumbnail: "", raw: { id }, category: "Meditation", date: "202611280000" });
  const e = env({ slideHeld: [], slideReleased: [{ id: "s9" }] });
  e.run("librarySync.js");
  clickOpenFull(e, slide("s9"));
  check("slideshow: newly released centerpiece opens and fullscreens", e.log.selects.includes("slideshow:s9") && e.log.fullscreen.join() === "slideshowViewer");
}

/* ============ Front Page door / release-notification hand-off (FrontPage.openItem) ============ */
{
  const e = env({ videoHeld: [vid("old")], videoReleased: [vid("old"), vid("new")] });
  e.run("librarySync.js");
  e.win.MediaManager = undefined;
  e.run("frontPage.js");
  e.win.FrontPage.openItem({ id: "new", section: "video", raw: vid("new"), title: "new" });
  check("FrontPage.openItem: a video released after startup is opened", e.log.shows.join() === "video" && e.log.selects.includes("video:new"), e.log.selects.join());
}

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASSED");
process.exit(failures ? 1 : 0);
