import { HttpException, type HttpStatus } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ statusCode: status, code, message }, status);
  }
}
