export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 根据路径判断目标服务器
  let targetHost;
  
  if (path.startsWith("/v2/")) {
    targetHost = "registry-1.docker.io";
  } else if (path.startsWith("/token")) {
    targetHost = "auth.docker.io";
  } else {
    return new Response("Multi-Registry Proxy for Pages", { status: 200 });
  }
  
  // 构建新的请求URL
  const newUrl = new URL(request.url);
  newUrl.hostname = targetHost;
  newUrl.port = "443";
  newUrl.protocol = "https:";
  
  // 复制所有请求头
  const newHeaders = new Headers(request.headers);
  newHeaders.set('Host', targetHost);
  
  const newRequest = new Request(newUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.body,
  });
  
  try {
    const response = await fetch(newRequest);
    return response;
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { status: 502 });
  }
}
