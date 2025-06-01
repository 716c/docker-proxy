export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // 根路径返回说明
  if (url.pathname === '/') {
    return new Response('Docker Registry Proxy', { status: 200 });
  }
  
  // Docker Registry API v2
  if (url.pathname.startsWith('/v2/')) {
    return await handleDockerRegistry(request, url);
  }
  
  // Docker Auth Token
  if (url.pathname.startsWith('/token')) {
    return await handleDockerAuth(request, url);
  }
  
  return new Response('Not Found', { status: 404 });
}

async function handleDockerRegistry(request, url) {
  const targetUrl = `https://registry-1.docker.io${url.pathname}${url.search}`;
  
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  }
  headers.set('Host', 'registry-1.docker.io');
  
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function handleDockerAuth(request, url) {
  const targetUrl = `https://auth.docker.io${url.pathname}${url.search}`;
  
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  }
  headers.set('Host', 'auth.docker.io');
  
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
