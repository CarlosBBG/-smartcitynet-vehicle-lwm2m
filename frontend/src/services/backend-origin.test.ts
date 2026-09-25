import { describe, expect, it } from 'vitest';

import { defaultBackendOrigin } from './backend-origin';

describe('defaultBackendOrigin', () => {
  it('usa el host LAN del navegador en el puerto de la API', () => {
    expect(defaultBackendOrigin('http://172.31.44.53:5173/vehicles')).toBe('http://172.31.44.53:3000');
  });

  it('conserva el acceso local desde localhost', () => {
    expect(defaultBackendOrigin('http://localhost:5173/')).toBe('http://localhost:3000');
  });
});
