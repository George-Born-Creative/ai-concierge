import { Injectable } from '@nestjs/common';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class OpportunitiesService {
  constructor(private readonly api: GhlApiService) {}
  listOpportunities(...args: Parameters<GhlApiService['listOpportunities']>) { return this.api.listOpportunities(...args); }
  getOpportunity(...args: Parameters<GhlApiService['getOpportunity']>) { return this.api.getOpportunity(...args); }
  createOpportunity(...args: Parameters<GhlApiService['createOpportunity']>) { return this.api.createOpportunity(...args); }
  updateOpportunity(...args: Parameters<GhlApiService['updateOpportunity']>) { return this.api.updateOpportunity(...args); }
  updateOpportunityStatus(...args: Parameters<GhlApiService['updateOpportunityStatus']>) { return this.api.updateOpportunityStatus(...args); }
  deleteOpportunity(...args: Parameters<GhlApiService['deleteOpportunity']>) { return this.api.deleteOpportunity(...args); }
}
