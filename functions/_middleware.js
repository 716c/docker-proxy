export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const host = url.hostname;
  
  // 根据请求路径判断目标注册表
  let targetHost;
  
  if (path.startsWith("/v2/") && host.includes("ghcr")) {
    // GitHub Container Registry
    targetHost = "ghcr.io";
  } else if (path.startsWith("/v2/")) {
    // Docker Hub
    targetHost = "registry-1.docker.io";
  } else if (path.startsWith("/token")) {
    // Docker Hub auth
    targetHost = "auth.docker.io";
  } else {
    return new Response("Multi-Registry Proxy for Pages", { status: 200 });
  }
  
  // 构建新的请求URL
  const newUrl = new URL(request.url);
  newUrl.hostname = targetHost;
  newUrl.port = "443";
  newUrl.protocol = "https:";
  
  const newRequest = new Request(newUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  
  return fetch(newRequest);
}
