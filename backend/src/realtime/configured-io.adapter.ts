import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly frontendOrigins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const configuredOptions = {
      ...options,
      cors: {
        origin: this.frontendOrigins,
        credentials: true,
      },
    } as ServerOptions;
    return super.createIOServer(port, configuredOptions);
  }
}
