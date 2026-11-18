// Små hjelpere som flere backend-funksjoner deler.
export const rows = (x) => (Array.isArray(x) ? x : (x?.items || []));
export const json = (body, status = 200) => Response.json(body, { status });
export const none = (e) => (e?.status === 404 ? null : Promise.reject(e));