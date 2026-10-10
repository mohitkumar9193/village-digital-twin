export function deploymentConfig(backendOrigin) {
  if (!backendOrigin) throw new Error('Set BACKEND_ORIGIN in Vercel to the HTTPS origin of your hosted Express backend.');
  const url = new URL(backendOrigin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || ['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)) {
    throw new Error('BACKEND_ORIGIN must be a public HTTPS origin, without credentials, path, query or fragment.');
  }
  return {
    framework: 'vite',
    installCommand: 'npm ci',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    rewrites: [
      {source: '/api/:path*', destination: `${url.origin}/api/:path*`},
      {source: '/((?!api/).*)', destination: '/index.html'},
    ],
    headers: [
      {source: '/api/:path*', headers: [{key:'Cache-Control',value:'private, no-store'}]},
      {source: '/(.*)', headers: [{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}]},
    ],
  };
}
