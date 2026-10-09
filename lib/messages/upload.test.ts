import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, validateImageFile } from './upload'

describe('message image upload contract', () => {
  it('accepts supported images and rejects unsafe/oversized files', () => {
    expect(validateImageFile({ type: 'image/png', size: 10 })).toBeNull()
    expect(validateImageFile({ type: 'image/gif', size: 10 })).toBeTruthy()
    expect(validateImageFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 })).toBeTruthy()
  })
})
