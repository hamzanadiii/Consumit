import { expect, it } from 'vitest'
import { standardQualityHeight } from './quality-tier'

it('maps cropped and slightly misreported frames to universal quality tiers', () => {
  expect(standardQualityHeight(802, 1921)).toBe(1080)
  expect(standardQualityHeight(534, 1280)).toBe(720)
  expect(standardQualityHeight(360, 854)).toBe(480)
  expect(standardQualityHeight(1608, 3840)).toBe(2160)
  expect(standardQualityHeight(640)).toBe(720)
  expect([144, 240, 360, 480, 720, 1080, 1440, 2160, 4320].map((height) => standardQualityHeight(height))).toEqual([144, 240, 360, 480, 720, 1080, 1440, 2160, 4320])
  expect(standardQualityHeight(0)).toBeUndefined()
  expect(standardQualityHeight(NaN)).toBeUndefined()
})
