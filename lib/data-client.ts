/** Desktop uses HTTP; the PWA build aliases this module to its local dispatcher. */
export const dataFetch: typeof fetch = (...args) => fetch(...args);
export const isOfflineApp = false;
export const assetUrl = (url: string) => url;
