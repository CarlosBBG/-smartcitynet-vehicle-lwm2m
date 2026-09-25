export function defaultBackendOrigin(href = window.location.href): string {
  const url = new URL(href);
  url.port = '3000';
  return url.origin;
}
