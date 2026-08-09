import { makeCartConfigurationKey } from '../../hooks/useCart'

const first = {
  optionGroupId: 'group-1',
  optionChoiceId: 'choice-1',
  groupName: 'Milk',
  choiceName: 'Oat milk',
  priceAdjustmentCents: 75,
}

const second = {
  optionGroupId: 'group-2',
  optionChoiceId: 'choice-2',
  groupName: 'Sweetness',
  choiceName: 'Half sweet',
  priceAdjustmentCents: 0,
}

describe('makeCartConfigurationKey', () => {
  it('treats the same choices in a different order as identical', () => {
    expect(
      makeCartConfigurationKey({
        menuItemId: 'item-1',
        selectedOptions: [first, second],
        specialInstructions: '',
      }),
    ).toBe(
      makeCartConfigurationKey({
        menuItemId: 'item-1',
        selectedOptions: [second, first],
        specialInstructions: '',
      }),
    )
  })

  it('keeps different item notes on separate cart lines', () => {
    const plain = makeCartConfigurationKey({
      menuItemId: 'item-1',
      selectedOptions: [first],
      specialInstructions: '',
    })
    const withNote = makeCartConfigurationKey({
      menuItemId: 'item-1',
      selectedOptions: [first],
      specialInstructions: 'Light ice',
    })

    expect(plain).not.toBe(withNote)
  })
})
