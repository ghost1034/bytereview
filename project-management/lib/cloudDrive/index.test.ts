import { describe, expect, it } from 'vitest'

import { getAvailableCloudDriveProviders, getCloudDriveAdapter } from './index'

describe('cloud drive capability visibility', () => {
  it('hides every provider exposed only by the unsupported stub', () => {
    expect(getAvailableCloudDriveProviders(getCloudDriveAdapter())).toEqual([])
  })
})
