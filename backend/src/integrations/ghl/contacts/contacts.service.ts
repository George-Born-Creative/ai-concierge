import { Injectable } from '@nestjs/common';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class ContactsService {
  constructor(private readonly api: GhlApiService) {}
  listContacts(...args: Parameters<GhlApiService['listContacts']>) { return this.api.listContacts(...args); }
  createContact(...args: Parameters<GhlApiService['createContact']>) { return this.api.createContact(...args); }
  updateContact(...args: Parameters<GhlApiService['updateContact']>) { return this.api.updateContact(...args); }
  deleteContact(...args: Parameters<GhlApiService['deleteContact']>) { return this.api.deleteContact(...args); }
}
