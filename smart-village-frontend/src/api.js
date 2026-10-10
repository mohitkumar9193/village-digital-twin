export async function api(path, { token, body, method = 'GET', ...options } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', method, ...options, headers: { ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }, ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}) });
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.error?.fields?.length ? result.error.fields.map(f => `${f.field}: ${f.message}`).join('; ') : result.error?.message || `Request failed (${response.status})`); error.status = response.status; throw error; }
  return result;
}
export async function allRecords(path, token) {
  const items = []; let page = 1;
  while (page <= 50) {
    const result = await api(`${path}?limit=100&page=${page}`, { token });
    items.push(...result.data);
    if (items.length >= result.pagination.total) return { items, truncated: false };
    page++;
  }
  return { items, truncated: true };
}
