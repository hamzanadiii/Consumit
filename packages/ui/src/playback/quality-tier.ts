const QUALITY_TIERS = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320] as const

/** A cropped widescreen frame keeps the tier of its uncropped 16:9 raster. */
export function standardQualityHeight(height?: number, width?: number): number | undefined {
  if (height === undefined || !Number.isFinite(height) || height <= 0) return undefined
  const raster = width !== undefined && Number.isFinite(width) && width > height ? Math.max(height, width * 9 / 16) : height
  return QUALITY_TIERS.reduce<number>((best, tier) => Math.abs(tier - raster) < Math.abs(best - raster) ? tier : best, QUALITY_TIERS[0])
}
