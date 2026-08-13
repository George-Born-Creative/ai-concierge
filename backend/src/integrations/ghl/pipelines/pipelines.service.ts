import { Injectable } from '@nestjs/common';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class PipelinesService {
  constructor(private readonly api: GhlApiService) {}
  listPipelines(...args: Parameters<GhlApiService['listPipelines']>) { return this.api.listPipelines(...args); }
  getPipeline(...args: Parameters<GhlApiService['getPipeline']>) { return this.api.getPipeline(...args); }
  createPipeline(...args: Parameters<GhlApiService['createPipeline']>) { return this.api.createPipeline(...args); }
  updatePipeline(...args: Parameters<GhlApiService['updatePipeline']>) { return this.api.updatePipeline(...args); }
  deletePipeline(...args: Parameters<GhlApiService['deletePipeline']>) { return this.api.deletePipeline(...args); }
}
