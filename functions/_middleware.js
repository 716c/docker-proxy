export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 处理根路径
    if (url.pathname === '/') {
      return new Response('Docker Registry Proxy', { status: 200 });
    }
    
    // 处理 /v2/ 路径 - Docker Registry API
    if (url.pathname.startsWith('/v2/')) {
      const targetUrl = `https://registry-1.docker.io${url.pathname}${url.search}`;
      return await proxyRequest(request, targetUrl, 'registry-1.docker.io');
    }
    
    // 处理 /token 路径 - Docker Auth
    if (url.pathname.startsWith('/token')) {
      const targetUrl = `https://auth.docker.io${url.pathname}${url.search}`;
      return await proxyRequest(request, targetUrl, 'auth.docker.io');
    }
    
    // 处理 GitHub Container Registry
    if (url.pathname.startsWith('/ghcr/')) {
      const ghcrPath = url.pathname.replace('/ghcr', '');
      const targetUrl = `https://ghcr.io${ghcrPath}${url.search}`;
      return await proxyRequest(request, targetUrl, 'ghcr.io');
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

async function proxyRequest(request, targetUrl, targetHost) {
  const headers = new Headers(request.headers);
  headers.set('Host', targetHost);
  
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
  });
  
  try {
    const response = await fetch(proxyRequest);
    const newResponse = new Response(response.body, response);
    
    // 添加 CORS 头
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', '*');
    
    return newResponse;
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { status: 502 });
  }
}
