"use strict";

export default {
  async fetch(request, env, ctx) {
    return new Response(
      "SKYMEDIA WORKER TEST\n\n" +
      "This response is coming directly from worker.js.\n\n" +
      "If you can see this message, the live workers.dev URL is executing the deployed Worker code.",
      {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=UTF-8",
          "cache-control": "no-store, no-cache, must-revalidate",
          "pragma": "no-cache"
        }
      }
    );
  }
};
