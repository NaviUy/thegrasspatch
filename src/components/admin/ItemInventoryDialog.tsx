import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/apiClient'

type InventoryItem = {
  menuItemId: string
  name: string
  inventoryLimit: number | null
  quantitySold: number
  remainingQuantity: number | null
  manuallySoldOut: boolean
  isSoldOut: boolean
  isLimitedAvailability: boolean
}

export function ItemInventoryDialog({
  menuItemId,
  name,
}: {
  menuItemId: string
  name: string
}) {
  const [open, setOpen] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [item, setItem] = useState<InventoryItem | null>(null)
  const [draftLimit, setDraftLimit] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const applyItem = (updated: InventoryItem) => {
    setItem(updated)
    setDraftLimit(
      updated.inventoryLimit === null ? '' : String(updated.inventoryLimit),
    )
  }

  const loadInventory = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const { session, items } = await api.getActiveInventory()
      const inventoryItem = (items as Array<InventoryItem>).find(
        (candidate) => candidate.menuItemId === menuItemId,
      )
      if (!inventoryItem) throw new Error('Inventory item was not found.')
      setSessionName(session.name)
      applyItem(inventoryItem)
    } catch (err: any) {
      setSessionName('')
      setItem(null)
      setError(err.message ?? 'Failed to load inventory.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void loadInventory()
  }, [open, menuItemId])

  const updateItem = async (updates: {
    inventoryLimit?: number | null
    isSoldOut?: boolean
  }) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const { item: updated } = await api.updateActiveInventory(
        menuItemId,
        updates,
      )
      applyItem(updated as InventoryItem)
      setMessage(`${name} inventory updated.`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to update inventory.')
    } finally {
      setSaving(false)
    }
  }

  const saveLimit = () => {
    const draft = draftLimit.trim()
    if (draft === '') {
      void updateItem({ inventoryLimit: null })
      return
    }

    const limit = Number(draft)
    if (!Number.isInteger(limit) || limit < 0) {
      setError('Inventory must be a nonnegative whole number.')
      return
    }
    void updateItem({ inventoryLimit: limit })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Edit Inventory
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit inventory for “{name}”</DialogTitle>
          <DialogDescription>
            {sessionName
              ? `Inventory for the active session: ${sessionName}.`
              : 'Inventory is configured separately for each active session.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Loading inventory…
          </p>
        ) : item ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  {item.inventoryLimit === null ? (
                    <p>Unlimited inventory · {item.quantitySold} ordered</p>
                  ) : (
                    <p>
                      {item.remainingQuantity} remaining of{' '}
                      {item.inventoryLimit} · {item.quantitySold} ordered
                    </p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    item.isSoldOut
                      ? 'bg-red-100 text-red-800'
                      : item.isLimitedAvailability
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {item.isSoldOut
                    ? 'Sold out'
                    : item.isLimitedAvailability
                      ? 'Low stock'
                      : 'Available'}
                </span>
              </div>
              {item.manuallySoldOut && (
                <p className="mt-2 text-xs text-red-700">
                  Manually marked sold out
                </p>
              )}
              {!item.manuallySoldOut &&
                item.isSoldOut &&
                item.remainingQuantity === 0 && (
                  <p className="mt-2 text-xs text-red-700">
                    Increase the starting quantity or use unlimited inventory to
                    make this item available again.
                  </p>
                )}
            </div>

            <div className="space-y-1">
              <Label htmlFor={`inventory-${menuItemId}`}>
                Starting quantity
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`inventory-${menuItemId}`}
                  type="number"
                  min={item.quantitySold}
                  step="1"
                  placeholder="Unlimited"
                  value={draftLimit}
                  onChange={(event) => setDraftLimit(event.target.value)}
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveLimit}
                  disabled={saving}
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Leave blank and save for unlimited inventory.
              </p>
            </div>

            <Button
              type="button"
              variant={item.manuallySoldOut ? 'outline' : 'destructive'}
              className="w-full"
              onClick={() => updateItem({ isSoldOut: !item.manuallySoldOut })}
              disabled={saving}
            >
              {item.manuallySoldOut ? 'Make available again' : 'Mark sold out'}
            </Button>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadInventory}
                disabled={saving}
              >
                Refresh count
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
