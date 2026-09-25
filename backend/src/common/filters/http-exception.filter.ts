import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      response.status(status).json({
        statusCode: status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: body,
      });
      return;
    }

    response.status(status).json(body);
  }
}
