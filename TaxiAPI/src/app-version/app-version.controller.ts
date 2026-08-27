import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AppVersionResponse {
  ios: {
    /** The latest published version of the app. */
    latestVersion: string;
    /** Minimum version required to use the API. Below this → forced update. */
    minimumVersion: string;
    /** App Store URL for the update CTA. */
    storeUrl: string;
  };
  android: {
    latestVersion: string;
    minimumVersion: string;
    /** Play Store URL for the update CTA. */
    storeUrl: string;
  };
}

/**
 * GET /app/version — public, no auth required.
 *
 * Returns the current and minimum required app version for each platform.
 * The mobile app checks this on startup:
 *   - currentVersion < minimumVersion → force update (non-dismissible modal)
 *   - currentVersion < latestVersion  → soft update (dismissible banner)
 */
@Controller('app')
export class AppVersionController {
  constructor(private readonly config: ConfigService) {}

  @Get('version')
  getVersion(): AppVersionResponse {
    return {
      ios: {
        latestVersion:  this.config.get<string>('APP_VERSION_IOS',     '1.0.0'),
        minimumVersion: this.config.get<string>('APP_MIN_VERSION_IOS', '1.0.0'),
        storeUrl:       this.config.get<string>(
          'APP_STORE_URL_IOS',
          'https://apps.apple.com/app/taximeiafert/id6786225522',
        ),
      },
      android: {
        latestVersion:  this.config.get<string>('APP_VERSION_ANDROID',     '1.0.0'),
        minimumVersion: this.config.get<string>('APP_MIN_VERSION_ANDROID', '1.0.0'),
        storeUrl:       this.config.get<string>(
          'APP_STORE_URL_ANDROID',
          'https://play.google.com/store/apps/details?id=com.taximelafert',
        ),
      },
    };
  }
}
