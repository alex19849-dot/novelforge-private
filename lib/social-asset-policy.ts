/** Generated scenes are not evidence that a product or edition exists. */
export const ARTWORK_ASSET_POLICY_VERSION = '2026-11-20-no-invented-products-v1';
export const ARTWORK_ASSET_RULES = [
  'PRODUCT ACCURACY IS REQUIRED. The catalogue supplies no verified physical editions or product mockup photographs. Do not depict or advertise a paperback, hardcover, hardback, printed edition, book spine, page block, 3D book product, stack of this book, Kindle/tablet/device mockup or invented cover.',
  'Do not draw or recreate any book cover, including a flat front cover. Use the exact book title and author as ordinary promotional typography integrated into the romantic scene. A genuine cover, when required, is inserted separately by application code from the original asset, never painted by the image model.',
  'Generic distant library shelves may be part of a setting, but no foreground physical book or identifiable advertised book product is allowed. This rule takes priority over stale layout labels, old briefs and edit history asking for a book mockup. Do not invent format availability in captions either.',
].join('\n');
export type ArtworkAssetCheck = {assetIntegrity?: 'pass'|'reject'|'unverified'; assetIssues?:string; coverFidelity:number};
export function assertVerifiedArtwork(check:ArtworkAssetCheck) {
  if(check.assetIntegrity!=='pass'||!Number.isFinite(check.coverFidelity)||check.coverFidelity<70) {
    throw new Error(`Artwork rejected: ${check.assetIssues?.trim() || 'The check could not verify that this artwork is free of invented book products or covers.'} No image was accepted. Create a fresh scene without a book mockup.`);
  }
}
