process.env.CLOUDINARY_CLOUD_NAME = 'demo';
process.env.CLOUDINARY_API_KEY    = '123456789';
process.env.CLOUDINARY_API_SECRET = 'test-secret';

import { documentViewUrl, parseCloudinaryUrl } from './document-storage';

describe('document-storage', () => {
  it('parses private image URLs (format split off the public id)', () => {
    expect(parseCloudinaryUrl(
      'https://res.cloudinary.com/demo/image/authenticated/v1712/driver-documents/abc123.jpg',
    )).toEqual({ resourceType: 'image', type: 'authenticated', publicId: 'driver-documents/abc123', format: 'jpg' });
  });

  it('parses raw (PDF) URLs keeping the extension in the public id', () => {
    expect(parseCloudinaryUrl(
      'https://res.cloudinary.com/demo/raw/authenticated/v1712/driver-documents/lic.pdf',
    )).toEqual({ resourceType: 'raw', type: 'authenticated', publicId: 'driver-documents/lic.pdf', format: undefined });
  });

  it('returns legacy public and non-Cloudinary URLs unchanged', () => {
    const pub = 'https://res.cloudinary.com/demo/image/upload/v1/driver-documents/x.png';
    expect(documentViewUrl(pub)).toBe(pub);
    expect(documentViewUrl('/uploads/documents/x.jpg')).toBe('/uploads/documents/x.jpg');
  });

  it('signs private documents with a short expiry', () => {
    const before = Math.floor(Date.now() / 1000);
    const url = new URL(documentViewUrl(
      'https://res.cloudinary.com/demo/raw/authenticated/v1712/driver-documents/lic.pdf',
    ));
    expect(url.origin + url.pathname).toBe('https://api.cloudinary.com/v1_1/demo/raw/download');
    expect(url.searchParams.get('public_id')).toBe('driver-documents/lic.pdf');
    expect(url.searchParams.get('type')).toBe('authenticated');
    expect(url.searchParams.get('signature')).toMatch(/^[0-9a-f]{40}$/);
    const exp = Number(url.searchParams.get('expires_at'));
    expect(exp).toBeGreaterThanOrEqual(before + 15 * 60);
    expect(exp).toBeLessThanOrEqual(before + 15 * 60 + 5);
  });
});
