/*
 * Composed OG image KV store.
 *   cp worker.js worker.mjs && node worker-og-cache.test.mjs
 */
const TOKEN = "SMCAT-TEST-9f7b2d4c-20260918";
const BASE = "https://example.workers.dev";
let n = 0;
const fresh = async () => (await import("./worker.mjs?i=" + (++n))).default;

let composes = 0, thumbFetches = 0, failThumb = false;
const remoteFetches = [], assetFetches = [];
globalThis.fetch = async url => {
  url = String(url);
  remoteFetches.push(url);
  if (url.includes("thumb")) { thumbFetches++; if (failThumb) return new Response("no", { status: 500 }); }
  return new Response("img:" + url);
};

function makeEnv() {
  const store = new Map(), ops = { get: 0, put: 0, gwm: 0 }, puts = [];
  return {
    ops, puts, store,
    MEDIA_KV: {
      async get(k, o) { ops.get++; const e = store.get(k); if (!e) return null; return o && o.type === "arrayBuffer" ? e.value : e.value; },
      async getWithMetadata(k) { ops.gwm++; const e = store.get(k); return e ? { value: e.value, metadata: e.metadata ?? null } : { value: null, metadata: null }; },
      async put(k, v, o) { ops.put++; puts.push({ k, o }); store.set(k, { value: v, metadata: o?.metadata }); }
    },
    ASSETS: { fetch: async req => { assetFetches.push(new URL(req.url ?? req).pathname); return new Response("a"); } },
    IMAGES: {
      async info() { return { width: 1200 }; },
      input() { const p = { transform() { return p; }, draw() { return p; },
        async output() { composes++; return { response(o) { return new Response(new TextEncoder().encode("WEBP" + composes), { headers: { "content-type": "image/webp", ...(o?.headers || {}) } }); } }; } };
        return p; }
    }
  };
}
const ctxs = () => { const w = []; return { w, waitUntil(p) { w.push(p); } }; };
const publish = (w, env, items) => w.fetch(new Request(BASE + "/__sky_catalog_publish", { method: "POST", headers: { "Content-Type": "application/json", "X-Sky-Catalog-Test-Token": TOKEN }, body: JSON.stringify({ contract: items }) }), env, ctxs());
const item = (id, thumb) => ({ id, type: "video", title: id, subtitle: "", thumbnail: thumb, media: "https://m.test/" + id, audio: "", author: "", category: "Meditation", date: "202609010900" });
const og = async (w, env, q = "section=video&id=v1") => { const c = ctxs(); const r = await w.fetch(new Request(BASE + "/__sky_og_image?" + q), env, c); await Promise.all(c.w); return r; };

let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); if (!ok) failures++; };

const w = await fresh();
const env = makeEnv();
await publish(w, env, [item("v1", "https://x.test/thumb-a.jpg"), item("v2", "https://x.test/thumb-b.jpg")]);

// 1st fetch composes and stores
env.ops.put = 0; env.puts.length = 0;
let r = await og(w, env);
check("1st fetch composes (200 webp)", r.status === 200 && composes === 1 && r.headers.get("content-type") === "image/webp");
check("1st fetch stores one og:v1: entry with a 30-day expiry", env.puts.length === 1 && env.puts[0].k.startsWith("og:v1:") && env.puts[0].o.expirationTtl === 2592000, JSON.stringify(env.puts));
const body1 = await r.text();

// the corner badge is the app's own new logo, not the old Glide-hosted one
check("badge is read from the app's static assets (/assets/logo-badge.png)", assetFetches.includes("/assets/logo-badge.png"), assetFetches.join(","));
check("no request goes out for the old Glide logo", !remoteFetches.some(u => u.includes("Qysgcds56u8OmAi76mCC")), remoteFetches.join(","));

// repeats come from KV
thumbFetches = 0;
r = await og(w, env); const body2 = await r.text();
check("2nd fetch served from KV: no compose, no thumbnail fetch", composes === 1 && thumbFetches === 0 && body2 === body1 && r.headers.get("cache-control").includes("max-age=86400"));
await og(w, env); await og(w, env);
check("more fetches still 0 composes", composes === 1);

// base link uses the same store
r = await og(w, env, "section=video&id=v1&base=1");
check("base=1 link shares the stored image", r.status === 200 && composes === 1);

// other item composes separately
await og(w, env, "section=video&id=v2");
check("different thumbnail -> its own compose + entry", composes === 2 && env.puts.length === 2 && env.puts[0].k !== env.puts[1].k);

// thumbnail changes -> refresh
await publish(w, env, [item("v1", "https://x.test/thumb-NEW.jpg"), item("v2", "https://x.test/thumb-b.jpg")]);
// the Worker may hold the old record in its isolate memory for up to KV_CACHE_TTL; use a fresh isolate to read the new one
const w2 = await fresh();
r = await og(w2, env);
check("changed thumbnail URL -> recomposed and stored under a new key", composes === 3 && env.puts.filter(p => p.k.startsWith("og:v1:")).length === 3, `composes=${composes}`);
await og(w2, env);
check("and then stable again", composes === 3);

// failure of the real thumbnail must not pin the stand-in
const envF = makeEnv(); const wf = await fresh();
await publish(wf, envF, [item("v1", "https://x.test/thumb-broken.jpg")]);
failThumb = true; composes = 0;
r = await og(wf, envF);
check("thumbnail load failure -> stand-in used but NOT stored", envF.puts.filter(p => p.k.startsWith("og:v1:")).length === 0 && r.status === 200);
failThumb = false;
await og(wf, envF);
check("once the thumbnail loads again it is composed and stored", envF.puts.filter(p => p.k.startsWith("og:v1:")).length === 1);

// KV read/write errors never break the image
const envE = makeEnv(); const we = await fresh();
await publish(we, envE, [item("v1", "https://x.test/thumb-e.jpg")]);
const realGet = envE.MEDIA_KV.get; envE.MEDIA_KV.get = async (k, o) => { if (String(k).startsWith("og:")) throw new Error("kv"); return realGet(k, o); };
envE.MEDIA_KV.put = async (k) => { if (String(k).startsWith("og:")) throw new Error("kvw"); };
const origWarn = console.warn; console.warn = () => {};
composes = 0; r = await og(we, envE);
console.warn = origWarn;
check("KV store read+write failures -> image still served", r.status === 200 && composes === 1);

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASSED");
process.exit(failures ? 1 : 0);
