import { Injectable } from '@nestjs/common';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class OpportunitiesService {
  constructor(private readonly api: GhlApiService) {}
  listOpportunities(...args: Parameters<GhlApiService['listOpportunities']>) { return this.api.listOpportunities(...args); }
  searchOpportunities(...args: Parameters<GhlApiService['searchOpportunities']>) { return this.api.searchOpportunities(...args); }
  getOpportunity(...args: Parameters<GhlApiService['getOpportunity']>) { return this.api.getOpportunity(...args); }
  createOpportunity(...args: Parameters<GhlApiService['createOpportunity']>) { return this.api.createOpportunity(...args); }
  upsertOpportunity(...args: Parameters<GhlApiService['upsertOpportunity']>) { return this.api.upsertOpportunity(...args); }
  updateOpportunity(...args: Parameters<GhlApiService['updateOpportunity']>) { return this.api.updateOpportunity(...args); }
  updateOpportunityStatus(...args: Parameters<GhlApiService['updateOpportunityStatus']>) { return this.api.updateOpportunityStatus(...args); }
  listLostReasons(...args: Parameters<GhlApiService['listLostReasons']>) { return this.api.listLostReasons(...args); }
  addOpportunityFollowers(...args: Parameters<GhlApiService['addOpportunityFollowers']>) { return this.api.addOpportunityFollowers(...args); }
  removeOpportunityFollowers(...args: Parameters<GhlApiService['removeOpportunityFollowers']>) { return this.api.removeOpportunityFollowers(...args); }
  deleteOpportunity(...args: Parameters<GhlApiService['deleteOpportunity']>) { return this.api.deleteOpportunity(...args); }
}
