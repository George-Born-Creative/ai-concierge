import { Injectable } from '@nestjs/common';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class PipelinesService {
  constructor(private readonly api: GhlApiService) {}
  listPipelines(...args: Parameters<GhlApiService['listPipelines']>) { return this.api.listPipelines(...args); }
}
