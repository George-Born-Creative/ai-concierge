import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CalendarV3QueryDto {
  @IsOptional() @IsString() calendarId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() serviceLocationId?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() query?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() showDrafted?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

/**
 * Validated superset shared by the v3 calendar resource endpoints. Location
 * identifiers are deliberately absent: they are always injected from OAuth.
 */
export class CalendarV3PayloadDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() calendarId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() serviceLocationId?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsString() appointmentStatus?: string;
  @IsOptional() @IsString() assignedUserId?: string;
  @IsOptional() @IsString() notificationId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() rrule?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() meetingLocation?: string;
  @IsOptional() @IsString() selectedUsers?: string;
  @IsOptional() @IsString() eventColor?: string;
  @IsOptional() @IsString() eventTitle?: string;
  @IsOptional() @IsString() formId?: string;
  @IsOptional() @IsString() formSubmitRedirectURL?: string;
  @IsOptional() @IsString() formSubmitThanksMessage?: string;
  @IsOptional() @IsString() alertEmail?: string;
  @IsOptional() @IsString() consentLabel?: string;
  @IsOptional() @IsString() calendarCoverImage?: string;
  @IsOptional() @IsIn(['round_robin', 'event', 'class_booking', 'collective', 'service_booking', 'personal']) calendarType?: string;
  @IsOptional() @IsIn(['default', 'classic']) widgetType?: string;
  @IsOptional() @IsIn(['mins', 'hours']) slotDurationUnit?: string;
  @IsOptional() @IsIn(['mins', 'hours']) slotIntervalUnit?: string;
  @IsOptional() @IsIn(['mins', 'hours']) slotBufferUnit?: string;
  @IsOptional() @IsIn(['mins', 'hours']) preBufferUnit?: string;
  @IsOptional() @IsIn(['RedirectURL', 'ThankYouMessage']) formSubmitType?: string;
  @IsOptional() @IsIn(['RoundRobin_OptimizeForAvailability', 'RoundRobin_OptimizeForEqualDistribution']) eventType?: string;
  @IsOptional() @IsIn(['hours', 'days', 'weeks', 'months', 'mins']) allowBookingAfterUnit?: string;
  @IsOptional() @IsIn(['days', 'weeks', 'months']) allowBookingForUnit?: string;
  @IsOptional() @IsIn(['count_only', 'collect_detail']) guestType?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() allowReschedule?: boolean;
  @IsOptional() @IsBoolean() allowCancellation?: boolean;
  @IsOptional() @IsBoolean() autoConfirm?: boolean;
  @IsOptional() @IsBoolean() enableRecurring?: boolean;
  @IsOptional() @IsBoolean() stickyContact?: boolean;
  @IsOptional() @IsBoolean() googleInvitationEmails?: boolean;
  @IsOptional() @IsBoolean() shouldSendAlertEmailsToAssignedMember?: boolean;
  @IsOptional() @IsBoolean() shouldAssignContactToTeamMember?: boolean;
  @IsOptional() @IsBoolean() shouldSkipAssigningContactForExisting?: boolean;
  @IsOptional() @IsBoolean() isLivePaymentMode?: boolean;
  @IsOptional() @IsBoolean() shouldSendToContact?: boolean;
  @IsOptional() @IsBoolean() shouldSendToGuest?: boolean;
  @IsOptional() @IsBoolean() shouldSendToUser?: boolean;
  @IsOptional() @IsBoolean() shouldSendToSelectedUsers?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) slotDuration?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) slotInterval?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) slotBuffer?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) preBuffer?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) appoinmentPerSlot?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) appoinmentPerDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) allowBookingAfter?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) allowBookingFor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) duration?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capacity?: number;
  @IsOptional() @IsArray() teamMembers?: Record<string, unknown>[];
  @IsOptional() @IsArray() locationConfigurations?: Record<string, unknown>[];
  @IsOptional() @IsArray() rules?: Record<string, unknown>[];
  @IsOptional() @IsArray() calendarIds?: string[];
  @IsOptional() @IsArray() userIds?: string[];
  @IsOptional() @IsArray() notifications?: Record<string, unknown>[];
  @IsOptional() @IsArray() users?: string[];
  @IsOptional() @IsArray() assignedResources?: string[];
  @IsOptional() @IsArray() services?: Record<string, unknown>[];
  @IsOptional() @IsObject() recurring?: Record<string, unknown>;
  @IsOptional() @IsObject() lookBusyConfig?: Record<string, unknown>;
  @IsOptional() @IsObject() paymentSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class AppointmentNoteDto {
  @IsString() @MinLength(1) body!: string;
}

export class UpdateAppointmentDto extends CalendarV3PayloadDto {}

export class BlockSlotDto {
  @IsString() @MinLength(1) calendarId!: string;
  @IsString() @MinLength(1) startTime!: string;
  @IsString() @MinLength(1) endTime!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() assignedUserId?: string;
}

export class AvailabilityRuleDto {
  @IsIn(['wday', 'date']) type!: 'wday' | 'date';
  @IsOptional() @IsString() day?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsArray() intervals!: { from: string; to: string }[];
}
