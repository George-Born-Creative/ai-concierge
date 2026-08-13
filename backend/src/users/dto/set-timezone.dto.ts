import { IsString, Matches, MaxLength } from 'class-validator';

// Matches IANA tz forms like "UTC", "America/Los_Angeles", "Africa/Addis_Ababa",
// "Etc/GMT+3". Permissive on purpose so we accept anything the browser /
// Intl.DateTimeFormat().resolvedOptions().timeZone can produce.
const IANA_TZ_REGEX = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/;

export class SetTimezoneDto {
  @IsString()
  @MaxLength(100)
  @Matches(IANA_TZ_REGEX, { message: 'timezone must be a valid IANA identifier' })
  timezone!: string;
}
