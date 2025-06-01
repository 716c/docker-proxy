export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const searchParams = url.searchParams;
  
  // 判断目标注册表
  let targetHost;
  let targetUrl;
  
  if (path.startsWith("/v2/")) {
    // Docker Hub registry
    targetHost = "registry-1.docker.io";
    targetUrl = `https://${targetHost}${path}`;
    if (url.search) {
      targetUrl += url.search;
    }
  } else if (path.startsWith("/token")) {
    // Docker Hub auth
    targetHost = "auth.docker.io";
    targetUrl = `https://${targetHost}${path}`;
    if (url.search) {
      targetUrl += url.search;
    }
  } else if (path.startsWith("/ghcr/v2/")) {
    // GitHub Container Registry
    targetHost = "ghcr.io";
    const ghcrPath = path.replace("/ghcr", "");
    targetUrl = `https://${targetHost}${ghcrPath}`;
    if (url.search) {
      targetUrl += url.search;
    }
  } else {
    return new Response("Multi-Registry Proxy for Docker Hub and GHCR", { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
  
  // 构建代理请求
  const proxyHeaders = new Headers();
  
  // 复制所有原始请求头，除了Host
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== 'host' && lowerKey !== 'cf-ray' && lowerKey !== 'cf-connecting-ip') {
      proxyHeaders.set(key, value);
    }
  }
  
  // 设置正确的Host头
  proxyHeaders.set('Host', targetHost);
  
  // 设置User-Agent
  if (!proxyHeaders.has('User-Agent')) {
    proxyHeaders.set('User-Agent', 'Docker-Client/20.10.0 (linux)');
  }
  
  try {
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
    });
    
    const response = await fetch(proxyRequest);
    
    // 创建响应副本
    const responseHeaders = new Headers(response.headers);
    
    // 移除可能导致问题的头
    responseHeaders.delete('cf-ray');
    responseHeaders.delete('cf-cache-status');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`Proxy Error: ${error.message}`, { 
      status: 502,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}
