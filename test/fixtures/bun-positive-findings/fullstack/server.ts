import index from "./index.html";

const server = Bun.serve({
  port: 0,
  routes: {
    "/": index,
    "/api/probe": new Response("full-stack-api-ok"),
  },
});

try {
  const htmlResponse = await fetch(server.url);
  const html = await htmlResponse.text();
  const scriptPath = /<script[^>]+src=["']([^"']+)["']/u.exec(html)?.[1];
  const stylePath = /<link[^>]+href=["']([^"']+)["']/u.exec(html)?.[1];
  const scriptResponse = scriptPath === undefined ? undefined : await fetch(new URL(scriptPath, server.url));
  const styleResponse = stylePath === undefined ? undefined : await fetch(new URL(stylePath, server.url));
  const apiResponse = await fetch(new URL("/api/probe", server.url));
  const receipt = {
    htmlStatus: htmlResponse.status,
    htmlMarker: html.includes("full-stack-html-ok"),
    scriptStatus: scriptResponse?.status,
    scriptMarker: (await scriptResponse?.text())?.includes("full-stack-client-ok"),
    styleStatus: styleResponse?.status,
    styleMarker: (await styleResponse?.text())?.includes("full-stack-css-ok"),
    apiStatus: apiResponse.status,
    apiMarker: (await apiResponse.text()) === "full-stack-api-ok",
  };
  console.log(`EFFECT_BUILD_FULL_STACK_RECEIPT=${JSON.stringify(receipt)}`);
} finally {
  server.stop(true);
}
