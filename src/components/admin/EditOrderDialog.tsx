import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type SelectedOption = {
  optionGroupId?: string | null
  optionChoiceId?: string | null
  groupName: string
  choiceName: string
  priceAdjustmentCents: number
}

export type EditableOrder = {
  id: string
  orderNumber?: number | null
  customerName: string
  version: number
  totalPriceCents: number
  foodAmountPaidCents: number
  foodAmountRefundedCents: number
  items: Array<{
    id: string
    menuItemId: string
    name?: string | null
    quantity: number
    unitPriceCents: number
    specialInstructions?: string | null
    selectedOptions: Array<SelectedOption>
  }>
}

type MenuItem = {
  id: string
  name: string
  priceCents: number
  isSoldOut: boolean
  options: Array<{
    id: string
    name: string
    selectionType: 'SINGLE' | 'MULTIPLE'
    isRequired: boolean
    minSelections: number
    maxSelections: number | null
    choices: Array<{
      id: string
      name: string
      priceAdjustmentCents: number
      isDefault: boolean
      isSoldOut: boolean
    }>
  }>
}

type DraftLine = {
  key: string
  lineId?: string
  menuItemId: string
  quantity: number
  selectedOptionChoiceIds: Array<string>
  specialInstructions: string
  originalName?: string | null
  originalQuantity?: number
  originalUnitPriceCents?: number
  originalSpecialInstructions?: string
  originalOptions: Array<SelectedOption>
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function eventLabel(type: string) {
  if (type === 'ORDER_CANCELLED') return 'Cancelled'
  if (type === 'ORDER_CORRECTED') return 'Corrected'
  if (type === 'ORDER_STATUS_CHANGED') return 'Status changed'
  if (type === 'ORDER_ASSIGNED') return 'Assigned'
  if (type === 'ORDER_UNASSIGNED') return 'Returned to pool'
  return 'Updated'
}

function newKey() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function defaultsFor(item: MenuItem) {
  return item.options.flatMap((group) =>
    group.choices
      .filter((choice) => choice.isDefault && !choice.isSoldOut)
      .map((choice) => choice.id),
  )
}

export function EditOrderDialog({
  order,
  menuItems,
  open,
  saving,
  history,
  onOpenChange,
  onSave,
}: {
  order: EditableOrder | null
  menuItems: Array<MenuItem>
  open: boolean
  saving: boolean
  history: Array<any>
  onOpenChange: (open: boolean) => void
  onSave: (input: {
    version: number
    reason: string
    items: Array<{
      lineId?: string
      menuItemId: string
      quantity: number
      selectedOptionChoiceIds: Array<string>
      specialInstructions: string
    }>
  }) => Promise<void>
}) {
  const [lines, setLines] = useState<Array<DraftLine>>([])
  const [reason, setReason] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [itemToAdd, setItemToAdd] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !order) return
    setLines(
      order.items.map((item) => ({
        key: item.id,
        lineId: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        selectedOptionChoiceIds: item.selectedOptions
          .map((option) => option.optionChoiceId)
          .filter((id): id is string => !!id),
        specialInstructions: item.specialInstructions ?? '',
        originalName: item.name,
        originalQuantity: item.quantity,
        originalUnitPriceCents: item.unitPriceCents,
        originalSpecialInstructions: item.specialInstructions ?? '',
        originalOptions: item.selectedOptions,
      })),
    )
    setReason('')
    setExpanded(new Set())
    setValidationError(null)
    setItemToAdd(menuItems.find((item) => !item.isSoldOut)?.id ?? '')
  }, [menuItems, open, order])

  const menuById = useMemo(
    () => new Map(menuItems.map((item) => [item.id, item])),
    [menuItems],
  )

  const updateLine = (key: string, update: Partial<DraftLine>) => {
    setValidationError(null)
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...update } : line)),
    )
  }

  const splitOne = (line: DraftLine) => {
    if (line.quantity <= 1) return
    const split = { ...line, key: newKey(), lineId: undefined, quantity: 1 }
    setLines((current) => {
      const index = current.findIndex((candidate) => candidate.key === line.key)
      const next = [...current]
      next[index] = { ...line, quantity: line.quantity - 1 }
      next.splice(index + 1, 0, split)
      return next
    })
    setExpanded((current) => new Set(current).add(split.key))
  }

  const toggleChoice = (
    line: DraftLine,
    group: MenuItem['options'][number],
    choiceId: string,
  ) => {
    const selected = new Set(line.selectedOptionChoiceIds)
    if (group.selectionType === 'SINGLE') {
      group.choices.forEach((choice) => selected.delete(choice.id))
      selected.add(choiceId)
    } else if (selected.has(choiceId)) {
      selected.delete(choiceId)
    } else {
      const selectedInGroup = group.choices.filter((choice) =>
        selected.has(choice.id),
      ).length
      if (
        group.maxSelections !== null &&
        selectedInGroup >= group.maxSelections
      ) {
        setValidationError(
          `Choose no more than ${group.maxSelections} from ${group.name}.`,
        )
        return
      }
      selected.add(choiceId)
    }
    updateLine(line.key, { selectedOptionChoiceIds: [...selected] })
  }

  const addItem = () => {
    const item = menuById.get(itemToAdd)
    if (!item || item.isSoldOut) return
    const line: DraftLine = {
      key: newKey(),
      menuItemId: item.id,
      quantity: 1,
      selectedOptionChoiceIds: defaultsFor(item),
      specialInstructions: '',
      originalName: item.name,
      originalOptions: [],
    }
    setLines((current) => [...current, line])
    setExpanded((current) => new Set(current).add(line.key))
  }

  const validate = () => {
    if (!lines.length)
      return 'An order must contain at least one item. Cancel the order instead.'
    if (reason.trim().length < 2) return 'Enter a reason for the correction.'
    for (const line of lines) {
      const item = menuById.get(line.menuItemId)
      if (!item) continue
      for (const group of item.options) {
        const count = group.choices.filter((choice) =>
          line.selectedOptionChoiceIds.includes(choice.id),
        ).length
        const minimum = group.isRequired
          ? Math.max(1, group.minSelections)
          : group.minSelections
        if (count < minimum)
          return `Choose the required options for ${item.name}: ${group.name}.`
        if (group.maxSelections !== null && count > group.maxSelections) {
          return `Choose no more than ${group.maxSelections} from ${group.name}.`
        }
      }
    }
    return null
  }

  const estimatedTotal = lines.reduce((total, line) => {
    const item = menuById.get(line.menuItemId)
    if (!item) return total + (line.originalUnitPriceCents ?? 0) * line.quantity
    const originalChoiceIds = line.originalOptions
      .map((option) => option.optionChoiceId)
      .filter(Boolean)
      .sort()
    const currentChoiceIds = [...line.selectedOptionChoiceIds].sort()
    const unchanged =
      !!line.lineId &&
      line.quantity === line.originalQuantity &&
      line.specialInstructions === line.originalSpecialInstructions &&
      JSON.stringify(originalChoiceIds) === JSON.stringify(currentChoiceIds)
    if (unchanged && line.originalUnitPriceCents !== undefined) {
      return total + line.originalUnitPriceCents * line.quantity
    }
    const adjustments = item.options
      .flatMap((group) => group.choices)
      .reduce(
        (sum, choice) =>
          line.selectedOptionChoiceIds.includes(choice.id)
            ? sum + choice.priceAdjustmentCents
            : sum,
        0,
      )
    return total + (item.priceCents + adjustments) * line.quantity
  }, 0)
  const netFoodPaidCents = Math.max(
    0,
    (order?.foodAmountPaidCents ?? 0) - (order?.foodAmountRefundedCents ?? 0),
  )
  const automaticRefundCents = Math.max(0, netFoodPaidCents - estimatedTotal)
  const staffReconciliationCents = Math.max(
    0,
    estimatedTotal - netFoodPaidCents,
  )

  const submit = async () => {
    if (!order) return
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }
    try {
      await onSave({
        version: order.version,
        reason: reason.trim(),
        items: lines.map((line) => ({
          lineId: line.lineId,
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          selectedOptionChoiceIds: line.selectedOptionChoiceIds,
          specialInstructions: line.specialInstructions.trim(),
        })),
      })
    } catch (saveError: any) {
      setValidationError(saveError?.message ?? 'Failed to save the correction.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {order?.customerName}'s order</DialogTitle>
          <DialogDescription>
            Split grouped drinks before changing options for only one drink.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {lines.map((line) => {
            const item = menuById.get(line.menuItemId)
            const isExpanded = expanded.has(line.key)
            const optionLabels = line.selectedOptionChoiceIds
              .map((id) => {
                const current = item?.options
                  .flatMap((group) => group.choices)
                  .find((choice) => choice.id === id)
                return (
                  current?.name ??
                  line.originalOptions.find(
                    (option) => option.optionChoiceId === id,
                  )?.choiceName
                )
              })
              .filter(Boolean)
            const currentChoiceIds = new Set(
              item?.options.flatMap((group) =>
                group.choices.map((choice) => choice.id),
              ) ?? [],
            )
            const unavailableSelections = line.originalOptions.filter(
              (option) =>
                !!option.optionChoiceId &&
                line.selectedOptionChoiceIds.includes(option.optionChoiceId) &&
                !currentChoiceIds.has(option.optionChoiceId),
            )
            return (
              <div
                key={line.key}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {item?.name ?? line.originalName ?? 'Menu item'}
                    </p>
                    {optionLabels.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {optionLabels.join(', ')}
                      </p>
                    )}
                    {line.specialInstructions && (
                      <p className="text-xs italic text-slate-600">
                        Note: {line.specialInstructions}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() =>
                      setLines((current) =>
                        current.filter(
                          (candidate) => candidate.key !== line.key,
                        ),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={line.quantity <= 1}
                    onClick={() =>
                      updateLine(line.key, { quantity: line.quantity - 1 })
                    }
                  >
                    −
                  </Button>
                  <span className="min-w-8 text-center text-sm font-medium">
                    {line.quantity}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateLine(line.key, {
                        quantity: Math.min(99, line.quantity + 1),
                      })
                    }
                  >
                    +
                  </Button>
                  {line.quantity > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => splitOne(line)}
                    >
                      Split one
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current)
                        next.has(line.key)
                          ? next.delete(line.key)
                          : next.add(line.key)
                        return next
                      })
                    }
                  >
                    {isExpanded ? 'Hide options' : 'Edit options'}
                  </Button>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    {!item ? (
                      <p className="text-xs text-amber-700">
                        This item is no longer on the active menu. Its existing
                        configuration can be kept or removed.
                      </p>
                    ) : item.options.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        This item has no options.
                      </p>
                    ) : (
                      item.options.map((group) => {
                        const minimum = group.isRequired
                          ? Math.max(1, group.minSelections)
                          : group.minSelections
                        return (
                          <fieldset key={group.id} className="space-y-2">
                            <legend className="text-xs font-semibold">
                              {group.name}{' '}
                              <span className="font-normal text-slate-500">
                                {minimum
                                  ? `Choose at least ${minimum}`
                                  : 'Optional'}
                              </span>
                            </legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {group.selectionType === 'SINGLE' &&
                                minimum === 0 && (
                                  <label className="flex items-center gap-2 rounded border px-3 py-2 text-xs">
                                    <input
                                      type="radio"
                                      name={`${line.key}-${group.id}`}
                                      checked={
                                        !group.choices.some((choice) =>
                                          line.selectedOptionChoiceIds.includes(
                                            choice.id,
                                          ),
                                        )
                                      }
                                      onChange={() =>
                                        updateLine(line.key, {
                                          selectedOptionChoiceIds:
                                            line.selectedOptionChoiceIds.filter(
                                              (id) =>
                                                !group.choices.some(
                                                  (choice) => choice.id === id,
                                                ),
                                            ),
                                        })
                                      }
                                    />
                                    <span>No selection</span>
                                  </label>
                                )}
                              {group.choices.map((choice) => (
                                <label
                                  key={choice.id}
                                  className={`flex items-center gap-2 rounded border px-3 py-2 text-xs ${choice.isSoldOut && !line.selectedOptionChoiceIds.includes(choice.id) ? 'bg-slate-50 text-slate-400' : ''}`}
                                >
                                  <input
                                    type={
                                      group.selectionType === 'SINGLE'
                                        ? 'radio'
                                        : 'checkbox'
                                    }
                                    name={`${line.key}-${group.id}`}
                                    checked={line.selectedOptionChoiceIds.includes(
                                      choice.id,
                                    )}
                                    disabled={
                                      choice.isSoldOut &&
                                      !line.selectedOptionChoiceIds.includes(
                                        choice.id,
                                      )
                                    }
                                    onChange={() =>
                                      toggleChoice(line, group, choice.id)
                                    }
                                  />
                                  <span className="flex-1">{choice.name}</span>
                                  {choice.priceAdjustmentCents > 0 && (
                                    <span>
                                      +{dollars(choice.priceAdjustmentCents)}
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        )
                      })
                    )}
                    {unavailableSelections.length > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-900">
                          Previously selected options
                        </p>
                        {unavailableSelections.map((option) => (
                          <div
                            key={option.optionChoiceId}
                            className="mt-2 flex items-center justify-between gap-2 text-xs text-amber-900"
                          >
                            <span>
                              {option.groupName}: {option.choiceName}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-700"
                              onClick={() =>
                                updateLine(line.key, {
                                  selectedOptionChoiceIds:
                                    line.selectedOptionChoiceIds.filter(
                                      (id) => id !== option.optionChoiceId,
                                    ),
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <label
                        className="text-xs font-semibold"
                        htmlFor={`order-note-${line.key}`}
                      >
                        Customer note
                      </label>
                      <textarea
                        id={`order-note-${line.key}`}
                        rows={2}
                        maxLength={200}
                        value={line.specialInstructions}
                        onChange={(event) =>
                          updateLine(line.key, {
                            specialInstructions: event.target.value.slice(
                              0,
                              200,
                            ),
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        placeholder="For example: light ice"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
            <select
              value={itemToAdd}
              onChange={(event) => setItemToAdd(event.target.value)}
              className="min-w-48 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Choose an item</option>
              {menuItems.map((item) => (
                <option key={item.id} value={item.id} disabled={item.isSoldOut}>
                  {item.name}
                  {item.isSoldOut ? ' — sold out' : ''}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={!itemToAdd || menuById.get(itemToAdd)?.isSoldOut}
              onClick={addItem}
            >
              Add item
            </Button>
          </div>

          <div>
            <label
              className="text-sm font-semibold"
              htmlFor="correction-reason"
            >
              Reason for correction
            </label>
            <input
              id="correction-reason"
              maxLength={250}
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 250))}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="For example: Customer changed milk selection"
            />
          </div>
          <p className="text-sm font-semibold">
            Estimated updated total: {dollars(estimatedTotal)}
          </p>
          {automaticRefundCents > 0 && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Saving will automatically refund {dollars(automaticRefundCents)}{' '}
              to the customer's original payment method.
            </p>
          )}
          {staffReconciliationCents > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              Stripe will not automatically charge the additional{' '}
              {dollars(staffReconciliationCents)}. Staff must reconcile this
              amount with the customer.
            </p>
          )}
          {validationError && (
            <p className="text-sm text-red-600">{validationError}</p>
          )}

          {history.length > 0 && (
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Order history ({history.length})
              </summary>
              <div className="mt-3 space-y-2">
                {history.map((event) => (
                  <div key={event.id} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">
                      {eventLabel(event.type)}
                    </span>{' '}
                    by {event.actorName ?? 'Staff'} ·{' '}
                    {new Date(event.createdAt).toLocaleString()}
                    {event.reason && <p>{event.reason}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
