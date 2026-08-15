import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from './hubspot-api.client';

@Injectable()
export class HubspotAssociationsService {
  constructor(private readonly api: HubspotApiClient) {}

  async associate(
    userId: string,
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string,
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const ids = this.validateIds(fromObjectType, fromObjectId, toObjectType, toObjectId);
    await this.api.request<void>(
      userId,
      'PUT',
      `/crm/v4/objects/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(
        ids.fromId,
      )}/associations/default/${encodeURIComponent(toObjectType)}/${encodeURIComponent(
        ids.toId,
      )}`,
    );
    return { ok: true };
  }

  async disassociate(
    userId: string,
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string,
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const ids = this.validateIds(fromObjectType, fromObjectId, toObjectType, toObjectId);
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v4/objects/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(
        ids.fromId,
      )}/associations/${encodeURIComponent(toObjectType)}/${encodeURIComponent(ids.toId)}`,
    );
    return { ok: true };
  }

  private validateIds(
    fromType: string,
    fromId: string,
    toType: string,
    toId: string,
  ): { fromId: string; toId: string } {
    const normalizedFrom = fromId?.trim();
    const normalizedTo = toId?.trim();
    if (!normalizedFrom) {
      throw new BadRequestException(`${label(fromType)} id is required.`);
    }
    if (!normalizedTo) {
      throw new BadRequestException(`${label(toType)} id is required.`);
    }
    return { fromId: normalizedFrom, toId: normalizedTo };
  }
}

function label(type: string): string {
  const singular = type.endsWith('ies')
    ? `${type.slice(0, -3)}y`
    : type.endsWith('s')
      ? type.slice(0, -1)
      : type;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}
