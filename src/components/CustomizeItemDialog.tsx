import { useEffect, useMemo, useState } from 'react'
import type { CartOption } from '@/hooks/useCart'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export type MenuOptionChoice = {
  id: string
  groupId: string
  name: string
  priceAdjustmentCents: number
  isDefault: boolean
  isActive: boolean
  isSoldOut: boolean
  isLimitedAvailability: boolean
  remainingQuantity: number | null
}

export type MenuOptionGroup = {
  id: string
  name: string
  selectionType: 'SINGLE' | 'MULTIPLE'
  isRequired: boolean
  minSelections: number
  maxSelections: number | null
  isActive: boolean
  choices: Array<MenuOptionChoice>
}

type CustomizableItem = {
  id: string
  name: string
  priceCents: number
  isSoldOut: boolean
  options: Array<MenuOptionGroup>
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function CustomizeItemDialog({
  item,
  onAdd,
}: {
  item: CustomizableItem
  onAdd: (input: {
    selectedOptions: Array<CartOption>
    specialInstructions: string
    priceCents: number
  }) => boolean
}) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedIds(
      new Set(
        item.options.flatMap((group) =>
          group.choices
            .filter(
              (choice) =>
                choice.isActive && choice.isDefault && !choice.isSoldOut,
            )
            .map((choice) => choice.id),
        ),
      ),
    )
    setSpecialInstructions('')
    setError(null)
  }, [item.options, open])

  const selectedOptions = useMemo(
    () =>
      item.options.flatMap((group) =>
        group.choices
          .filter((choice) => selectedIds.has(choice.id))
          .map((choice) => ({
            optionGroupId: group.id,
            optionChoiceId: choice.id,
            groupName: group.name,
            choiceName: choice.name,
            priceAdjustmentCents: choice.priceAdjustmentCents,
          })),
      ),
    [item.options, selectedIds],
  )
  const configuredPrice =
    item.priceCents +
    selectedOptions.reduce(
      (total, option) => total + option.priceAdjustmentCents,
      0,
    )

  const toggleChoice = (group: MenuOptionGroup, choiceId: string) => {
    setError(null)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (group.selectionType === 'SINGLE') {
        group.choices.forEach((choice) => next.delete(choice.id))
        next.add(choiceId)
        return next
      }
      if (next.has(choiceId)) {
        next.delete(choiceId)
        return next
      }
      const selectedCount = group.choices.filter((choice) =>
        next.has(choice.id),
      ).length
      if (
        group.maxSelections !== null &&
        selectedCount >= group.maxSelections
      ) {
        setError(
          `Choose no more than ${group.maxSelections} from ${group.name}.`,
        )
        return current
      }
      next.add(choiceId)
      return next
    })
  }

  const clearGroup = (group: MenuOptionGroup) => {
    setError(null)
    setSelectedIds((current) => {
      const next = new Set(current)
      group.choices.forEach((choice) => next.delete(choice.id))
      return next
    })
  }

  const handleAdd = () => {
    for (const group of item.options) {
      const count = group.choices.filter((choice) =>
        selectedIds.has(choice.id),
      ).length
      const minimum = group.isRequired
        ? Math.max(1, group.minSelections)
        : group.minSelections
      if (count < minimum) {
        setError(
          minimum === 1
            ? `Choose an option from ${group.name}.`
            : `Choose at least ${minimum} options from ${group.name}.`,
        )
        return
      }
      if (group.maxSelections !== null && count > group.maxSelections) {
        setError(
          `Choose no more than ${group.maxSelections} from ${group.name}.`,
        )
        return
      }
    }

    if (
      onAdd({
        selectedOptions,
        specialInstructions: specialInstructions.trim(),
        priceCents: configuredPrice,
      })
    ) {
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={item.isSoldOut} className="ml-auto">
          {item.isSoldOut ? 'Sold out' : 'Add to cart'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize {item.name}</DialogTitle>
          <DialogDescription>
            Select your options and add a note if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {item.options.map((group) => {
            const minimum = group.isRequired
              ? Math.max(1, group.minSelections)
              : group.minSelections
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="text-sm font-semibold text-slate-900">
                  {group.name}{' '}
                  <span className="font-normal text-slate-500">
                    {minimum > 0
                      ? `Choose ${minimum}${group.maxSelections && group.maxSelections !== minimum ? `–${group.maxSelections}` : ''}`
                      : 'Optional'}
                  </span>
                </legend>
                <div className="space-y-2">
                  {group.selectionType === 'SINGLE' && minimum === 0 && (
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <input
                        type="radio"
                        name={`option-${group.id}`}
                        checked={
                          !group.choices.some((choice) =>
                            selectedIds.has(choice.id),
                          )
                        }
                        onChange={() => clearGroup(group)}
                      />
                      <span className="flex-1 text-sm">No selection</span>
                    </label>
                  )}
                  {group.choices.map((choice) => (
                    <label
                      key={choice.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        choice.isSoldOut
                          ? 'cursor-not-allowed bg-slate-50 text-slate-400'
                          : 'cursor-pointer border-slate-200'
                      }`}
                    >
                      <input
                        type={
                          group.selectionType === 'SINGLE'
                            ? 'radio'
                            : 'checkbox'
                        }
                        name={`option-${group.id}`}
                        checked={selectedIds.has(choice.id)}
                        disabled={choice.isSoldOut}
                        onChange={() => toggleChoice(group, choice.id)}
                      />
                      <span className="flex-1 text-sm">{choice.name}</span>
                      <span className="text-xs">
                        {choice.isSoldOut
                          ? 'Sold out'
                          : `${
                              choice.priceAdjustmentCents > 0
                                ? `+${formatPrice(choice.priceAdjustmentCents)}`
                                : 'Included'
                            }${choice.isLimitedAvailability ? ' · Limited' : ''}`}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          })}

          <div className="space-y-1.5">
            <label
              htmlFor={`note-${item.id}`}
              className="text-sm font-medium text-slate-900"
            >
              Note for this item (optional)
            </label>
            <textarea
              id={`note-${item.id}`}
              value={specialInstructions}
              onChange={(event) =>
                setSpecialInstructions(event.target.value.slice(0, 200))
              }
              maxLength={200}
              rows={3}
              placeholder="For example: light ice"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <p className="text-right text-xs text-slate-500">
              {specialInstructions.length}/200
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd}>
            Add · {formatPrice(configuredPrice)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
