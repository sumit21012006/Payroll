export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Global Fetch Interceptor to automatically attach API access key header on the client-side
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const token = localStorage.getItem('sessionToken');
    if (token) {
      init = init || {};
      init.headers = init.headers || {};
      
      if (init.headers instanceof Headers) {
        if (!init.headers.has('Authorization')) {
          init.headers.set('Authorization', `Bearer ${token}`);
        }
      } else if (Array.isArray(init.headers)) {
        const hasAuth = init.headers.some(([k]) => k.toLowerCase() === 'authorization');
        if (!hasAuth) {
          init.headers.push(['Authorization', `Bearer ${token}`]);
        }
      } else {
        const headersRecord = init.headers as Record<string, string>;
        if (!headersRecord['Authorization'] && !headersRecord['authorization']) {
          headersRecord['Authorization'] = `Bearer ${token}`;
        }
      }
    }
    return originalFetch(input, init);
  };
}
