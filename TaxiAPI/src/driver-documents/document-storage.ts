/**
 * Storage for driver ID documents (licence, registration, insurance …).
 *
 * New uploads are stored on Cloudinary as `authenticated` (private) assets:
 * the stored URL can't be opened on its own. Whenever a document is returned
 * to the app we hand out a signed download link that expires after
 * VIEW_LINK_TTL_S. Documents uploaded before this change are public
 * `upload`-type URLs and are returned unchanged.
 */
import { Logger } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const logger = new Logger('DocumentStorage');

/** How long a document view link stays valid. */
const VIEW_LINK_TTL_S = 15 * 60;

export type DocResourceType = 'image' | 'raw';

interface ParsedAsset {
  resourceType: DocResourceType;
  type:         string;          // 'upload' (public) | 'authenticated' (private)
  publicId:     string;
  format:       string | undefined;
}

/** Upload a buffer as a private asset and return its (unsigned) URL. */
export function uploadPrivateDocument(
  buffer: Buffer,
  folder: string,
  resourceType: DocResourceType,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, type: 'authenticated' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

/**
 * Split a Cloudinary delivery URL into its parts, e.g.
 *   https://res.cloudinary.com/<cloud>/image/authenticated/v123/driver-documents/abc.jpg
 * Image public ids exclude the extension (it's the format); raw ids include it.
 */
export function parseCloudinaryUrl(url: string): ParsedAsset | null {
  const m = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/(upload|authenticated|private)\/(?:v\d+\/)?(.+)$/.exec(url);
  if (!m) return null;
  const resourceType = m[1] as DocResourceType;
  const path = decodeURIComponent(m[3].split('?')[0]);
  if (resourceType === 'raw') {
    return { resourceType, type: m[2], publicId: path, format: undefined };
  }
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/')
    ? { resourceType, type: m[2], publicId: path.slice(0, dot), format: path.slice(dot + 1) }
    : { resourceType, type: m[2], publicId: path, format: undefined };
}

/** URL the app should open to view a document. Private assets get a
 *  short-lived signed link; legacy public ones are returned as stored. */
export function documentViewUrl(storedUrl: string): string {
  const asset = parseCloudinaryUrl(storedUrl);
  if (!asset || asset.type === 'upload') return storedUrl;
  try {
    return cloudinary.utils.private_download_url(asset.publicId, asset.format as string, {
      resource_type: asset.resourceType,
      type:          asset.type,
      expires_at:    Math.floor(Date.now() / 1000) + VIEW_LINK_TTL_S,
    });
  } catch (err) {
    logger.warn(`Could not sign document URL: ${(err as Error).message}`);
    return storedUrl;
  }
}

/** Remove a document file — from Cloudinary, or from local disk for very old
 *  uploads stored under /uploads. Never throws. */
export async function deleteDocumentFile(storedUrl: string): Promise<void> {
  const asset = parseCloudinaryUrl(storedUrl);
  try {
    if (asset) {
      await cloudinary.uploader.destroy(asset.publicId, {
        resource_type: asset.resourceType,
        type:          asset.type,
        invalidate:    true,
      });
      return;
    }
    const abs = join(process.cwd(), storedUrl);
    if (existsSync(abs)) unlinkSync(abs);
  } catch (err) {
    logger.warn(`Failed to delete document file ${storedUrl}: ${(err as Error).message}`);
  }
}
