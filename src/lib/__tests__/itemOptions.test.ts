import { validateOptionGroups } from '../itemOptions'
import type { OptionGroupInput } from '../itemOptions'

function group(overrides: Partial<OptionGroupInput> = {}): OptionGroupInput {
  return {
    name: 'Milk',
    selectionType: 'SINGLE',
    isRequired: true,
    minSelections: 1,
    maxSelections: 1,
    isActive: true,
    choices: [
      {
        name: 'Whole milk',
        priceAdjustmentCents: 0,
        isDefault: true,
        isActive: true,
      },
    ],
    ...overrides,
  }
}

describe('validateOptionGroups', () => {
  it('accepts a required single-choice group with one default', () => {
    expect(() => validateOptionGroups([group()])).not.toThrow()
  })

  it('requires a default for an active required group', () => {
    expect(() =>
      validateOptionGroups([
        group({
          minSelections: 0,
          choices: [
            {
              name: 'Whole milk',
              priceAdjustmentCents: 0,
              isDefault: false,
              isActive: true,
            },
          ],
        }),
      ]),
    ).toThrow('needs default selections')
  })

  it('rejects negative price adjustments and inventory', () => {
    expect(() =>
      validateOptionGroups([
        group({
          choices: [
            {
              name: 'Oat milk',
              priceAdjustmentCents: -1,
              inventoryLimit: -1,
              isDefault: true,
              isActive: true,
            },
          ],
        }),
      ]),
    ).toThrow('Option prices must be nonnegative')
  })

  it('rejects more defaults than a group allows', () => {
    expect(() =>
      validateOptionGroups([
        group({
          selectionType: 'MULTIPLE',
          maxSelections: 1,
          choices: [
            {
              name: 'Boba',
              priceAdjustmentCents: 50,
              isDefault: true,
              isActive: true,
            },
            {
              name: 'Jelly',
              priceAdjustmentCents: 50,
              isDefault: true,
              isActive: true,
            },
          ],
        }),
      ]),
    ).toThrow('too many defaults')
  })
})
