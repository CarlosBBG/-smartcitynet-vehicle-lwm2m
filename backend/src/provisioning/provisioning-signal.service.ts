import { Injectable } from '@nestjs/common';
import { Subject, type Subscription } from 'rxjs';

@Injectable()
export class ProvisioningSignalService {
  private readonly requests = new Subject<string>();

  request(vehicleId: string): void {
    this.requests.next(vehicleId);
  }

  subscribe(handler: (vehicleId: string) => void): Subscription {
    return this.requests.subscribe(handler);
  }
}
