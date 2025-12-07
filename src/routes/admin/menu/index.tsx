import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useAuthUser } from '@/hooks/useAuthUser'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/apiClient'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/components/ProductCard'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/admin/menu/')({
  component: RouteComponent,
})

type MenuItem = {
  id: string
  name: string
  priceCents: number
  imageUrl?: string | null
  imagePlaceholderUrl?: string | null
  badges?: Array<{ label: string; color?: string }> | null
  isActive: boolean
}

type EditMenuItemDialogProps = {
  item: MenuItem
  onUpdated: (updated: MenuItem) => void
}

type BadgeForm = { label: string }

function EditMenuItemDialog({ item, onUpdated }: EditMenuItemDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState((item.priceCents / 100).toFixed(2))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [badges, setBadges] = useState<BadgeForm[]>(
    item.badges?.map((b) => ({ label: b.label })) ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const priceNumber = Number(price)
    if (Number.isNaN(priceNumber)) {
      setError('Price must be a number')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const priceCents = Math.round(priceNumber * 100)
      let uploadedUrl: string | null = item.imageUrl ?? null
      let uploadedPlaceholder: string | null | undefined =
        item.imagePlaceholderUrl ?? null

      if (imageFile) {
        const { publicUrl, placeholderUrl } =
          await api.uploadMenuImage(imageFile)
        uploadedUrl = publicUrl
        uploadedPlaceholder = placeholderUrl
      }

      const { item: updated } = await api.updateMenuItem(item.id, {
        name: name.trim(),
        priceCents,
        imageUrl: uploadedUrl,
        imagePlaceholderUrl: uploadedPlaceholder,
        badges: badges.map((b) => ({ label: b.label, color: '#000000' })),
      })
      onUpdated(updated)
      setOpen(false) // ✅ only close on success
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to update item')
      // don't close; let user fix it
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit "{item.name}"</DialogTitle>
          <DialogDescription>
            Update the details for this menu item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-price">Price (e.g. 4.50)</Label>
            <Input
              id="edit-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-image">Image</Label>
            <Input
              id="edit-image"
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-slate-500">
              Upload a new image (required for updates).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Badges</Label>
            {badges.map((badge, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={badge.label}
                  placeholder="Label"
                  onChange={(e) =>
                    setBadges((prev) =>
                      prev.map((b, i) =>
                        i === idx ? { ...b, label: e.target.value } : b,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setBadges((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  x
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setBadges((prev) => [...prev, { label: '', color: '' }])
              }
            >
              Add badge
            </Button>
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent() {
  const router = useRouter()
  const { user, loading: authLoading, error: authError } = useAuthUser()
  const [items, setItems] = useState<MenuItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  //form
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [badges, setBadges] = useState<BadgeForm[]>([])
  const [creating, setCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loading = itemsLoading || authLoading
  const errorMessage = error ?? authError

  if (user?.role === 'WORKER') {
    router.navigate({ to: '/admin/queue' })
    return null
  }

  const reorderLocal = (draggedId: string, targetId: string) => {
    setItems((prev) => {
      const draggedIdx = prev.findIndex((i) => i.id === draggedId)
      const targetIdx = prev.findIndex((i) => i.id === targetId)
      if (draggedIdx === -1 || targetIdx === -1) return prev
      const updated = [...prev]
      const [draggedItem] = updated.splice(draggedIdx, 1)
      updated.splice(targetIdx, 0, draggedItem)
      // persist order
      api.reorderMenuItems(updated.map((i) => i.id)).catch((err) => {
        console.error(err)
        setError(err.message ?? 'Failed to save order.')
      })
      return updated
    })
  }

  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false

    async function loadMenuItems() {
      try {
        const { items } = await api.listMenuItems()
        if (!cancelled) setItems(items)
      } catch (error: any) {
        if (!cancelled) setError(error.message ?? 'Failed to load menu items.')
      } finally {
        if (!cancelled) setItemsLoading(false)
      }
    }

    loadMenuItems()
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !price.trim()) return

    const priceNumber = Number(price)
    if (Number.isNaN(priceNumber)) {
      setError('Price must be a number')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const priceCents = Math.round(priceNumber * 100)
      let uploadedUrl = undefined as string | undefined
      let uploadedPlaceholder: string | undefined

      if (imageFile) {
        const { publicUrl, placeholderUrl } =
          await api.uploadMenuImage(imageFile)
        uploadedUrl = publicUrl
        uploadedPlaceholder = placeholderUrl
      }

      const { item } = await api.createMenuItem({
        name: name.trim(),
        priceCents,
        imageUrl: uploadedUrl,
        imagePlaceholderUrl: uploadedPlaceholder,
        badges: badges.map((b) => ({ label: b.label, color: '#000000' })),
        isActive: true,
      })

      setItems((prev) => [item, ...prev])
      setName('')
      setPrice('')
      setImageFile(null)
      setBadges([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error: any) {
      console.error(error)
      setError(error.message ?? 'Failed to create menu item.')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (item: any) => {
    try {
      const { item: updated } = await api.updateMenuItem(item.id, {
        isActive: !item.isActive,
      })
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    } catch (error: any) {
      console.error(error)
      setError(error.message ?? 'Failed to update menu item.')
    }
  }

  const handleDelete = async (item: any) => {
    try {
      await api.deleteMenuItem(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch (error: any) {
      console.error(error)
      setError(error.message ?? 'Failed to delete menu item.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">Loading menu items…</div>
      </div>
    )
  }

  return (
    <AdminLayout user={user}>
      {errorMessage && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Menu Items</h2>
        <p className="text-sm text-slate-500">
          Create and manage drinks available for ordering.
        </p>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="create-session">
            <AccordionTrigger className="text-lg font-medium">
              Create new menu item
            </AccordionTrigger>
            <AccordionContent>
              <form
                onSubmit={handleCreate}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100"
              >
                <div className="space-y-1">
                  <Label htmlFor="item-name">Name</Label>
                  <Input
                    id="item-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder=" Iced Green Tea"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="item-price">Price (e.g. 4.50)</Label>
                  <Input
                    id="item-price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="item-image">Image</Label>
                  <Input
                    id="item-image"
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-[11px] text-slate-500">
                    Upload an image (optional).
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-3">
                  <Label>Badges</Label>
                  {badges.map((badge, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={badge.label}
                        placeholder="Label"
                        onChange={(e) =>
                          setBadges((prev) =>
                            prev.map((b, i) =>
                              i === idx ? { ...b, label: e.target.value } : b,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setBadges((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setBadges((prev) => [...prev, { label: '', color: '' }])
                    }
                  >
                    Add badge
                  </Button>
                </div>

                <div className="sm:col-span-3 flex justify-end">
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Creating…' : 'Add item'}
                  </Button>
                </div>
              </form>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4 mt-4">
        <h3 className="text-md font-semibold text-slate-900">Existing items</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            No menu items yet. Add one above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 justify-items-center">
            {items.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const draggedId = e.dataTransfer.getData('text/plain')
                  if (!draggedId || draggedId === item.id) return
                  reorderLocal(draggedId, item.id)
                }}
                className="w-full"
              >
                <ProductCard
                  title={item.name}
                  priceCents={item.priceCents}
                  imageUrl={item.imageUrl}
                  imagePlaceholderUrl={item.imagePlaceholderUrl}
                  isActive={item.isActive}
                  className="w-full max-w-xs cursor-move"
                >
                  <EditMenuItemDialog
                    item={item}
                    onUpdated={(updated) =>
                      setItems((prev) =>
                        prev.map((i) => (i.id === updated.id ? updated : i)),
                      )
                    }
                  />

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(item)}
                  >
                    {item.isActive ? 'Hide' : 'Show'}
                  </Button>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        Delete
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete “{item.name}”?</DialogTitle>
                        <DialogDescription>
                          This will remove the item from the menu. You won’t be
                          able to undo this action.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="flex justify-end gap-2">
                        <DialogClose asChild>
                          <Button variant="outline" size="sm">
                            Cancel
                          </Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(item)}
                          >
                            Delete
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </ProductCard>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  )
}
