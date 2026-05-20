import apiClient from './client';

export interface PlatformVersionInfo {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
}

export interface AppVersionResponse {
  ios: PlatformVersionInfo;
  android: PlatformVersionInfo;
}

export const appApi = {
  /** GET /app/version — public endpoint, no auth required */
  getVersion: () =>
    apiClient.get<AppVersionResponse>('/app/version'),
};
