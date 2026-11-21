export async function onRequest(context) {
  const { request, env, params } = context;
  const path = params.path || "";

  const targetUrl = `https://manojkumhal.com.np/api/${path}`;
  const url = new URL(request.url);

  const targetRequest = new Request(targetUrl + url.search, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "follow",
  });

  // Remove headers that shouldn't be forwarded
  targetRequest.headers.delete("host");

  const response = await fetch(targetRequest);

  // Add CORS headers
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  newHeaders.set("Access-Control-Allow-Headers", "Content-Type");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}