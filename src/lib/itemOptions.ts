export type OptionChoiceInput = {
  id?: string
  name: string
  priceAdjustmentCents: number
  isDefault: boolean
  isActive: boolean
  inventoryLimit?: number | null
  isSoldOut?: boolean
}

export type OptionGroupInput = {
  id?: string
  name: string
  selectionType: 'SINGLE' | 'MULTIPLE'
  isRequired: boolean
  minSelections: number
  maxSelections: number | null
  isActive: boolean
  choices: Array<OptionChoiceInput>
}

export function validateOptionGroups(groups: Array<OptionGroupInput>) {
  for (const group of groups) {
    if (!group.name.trim()) throw new Error('Option group names are required.')
    if (!['SINGLE', 'MULTIPLE'].includes(group.selectionType)) {
      throw new Error('Invalid option selection type.')
    }
    if (!Number.isInteger(group.minSelections) || group.minSelections < 0) {
      throw new Error('Minimum selections must be a nonnegative whole number.')
    }
    if (
      group.maxSelections !== null &&
      (!Number.isInteger(group.maxSelections) ||
        group.maxSelections < group.minSelections)
    ) {
      throw new Error('Maximum selections must be at least the minimum.')
    }
    if (group.selectionType === 'SINGLE' && group.maxSelections !== 1) {
      throw new Error('Single-choice groups must have a maximum of one.')
    }

    const activeChoices = group.choices.filter((choice) => choice.isActive)
    const defaults = activeChoices.filter((choice) => choice.isDefault)
    const effectiveMinimum = group.isRequired
      ? Math.max(1, group.minSelections)
      : group.minSelections
    if (group.choices.some((choice) => !choice.name.trim())) {
      throw new Error('Option choice names are required.')
    }
    if (
      group.choices.some(
        (choice) =>
          !Number.isInteger(choice.priceAdjustmentCents) ||
          choice.priceAdjustmentCents < 0,
      )
    ) {
      throw new Error('Option prices must be nonnegative whole cents.')
    }
    if (group.choices.some((choice) => !choice.isActive && choice.isDefault)) {
      throw new Error('Disabled choices cannot be defaults.')
    }
    if (
      group.choices.some(
        (choice) =>
          choice.inventoryLimit !== undefined &&
          choice.inventoryLimit !== null &&
          (!Number.isInteger(choice.inventoryLimit) ||
            choice.inventoryLimit < 0),
      )
    ) {
      throw new Error('Option inventory must be a nonnegative whole number.')
    }
    if (group.selectionType === 'SINGLE' && defaults.length > 1) {
      throw new Error('Single-choice groups can have only one default.')
    }
    if (group.isActive && defaults.length < effectiveMinimum) {
      throw new Error(`Group “${group.name}” needs default selections.`)
    }
    if (group.maxSelections !== null && defaults.length > group.maxSelections) {
      throw new Error(`Group “${group.name}” has too many defaults.`)
    }
    if (group.isActive && activeChoices.length < effectiveMinimum) {
      throw new Error(
        `Group “${group.name}” does not have enough active choices.`,
      )
    }
  }
}
