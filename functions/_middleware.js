export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Docker Hub registry proxy
  const registryHost = "registry-1.docker.io";
  const authHost = "auth.docker.io";
  
  if (path.startsWith("/v2/")) {
    // Handle registry requests
    const newUrl = new URL(request.url);
    newUrl.hostname = registryHost;
    newUrl.port = "443";
    newUrl.protocol = "https:";
    
    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    
    return fetch(newRequest);
  } else if (path.startsWith("/token")) {
    // Handle auth requests
    const newUrl = new URL(request.url);
    newUrl.hostname = authHost;
    newUrl.port = "443";
    newUrl.protocol = "https:";
    
    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    
    return fetch(newRequest);
  }
  
  return new Response("Docker Registry Proxy for Pages", { status: 200 });
}
