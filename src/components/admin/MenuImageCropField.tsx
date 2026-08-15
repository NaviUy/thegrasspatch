import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, MediaSize } from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MENU_IMAGE_ASPECT = 4 / 3
const MAX_OUTPUT_WIDTH = 1200
const MIN_ZOOM = 0.35
const MAX_ZOOM = 3

type MenuImageCropFieldProps = {
  id: string
  value: File | null
  onChange: (croppedFile: File | null, originalFile: File | null) => void
  existingImageUrl?: string | null
  existingOriginalImageUrl?: string | null
  disabled?: boolean
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error('The selected image could not be read.'))
    image.src = url
  })
}

async function createCroppedFile(
  imageUrl: string,
  crop: Area,
  originalName: string,
) {
  const image = await loadImage(imageUrl)
  const scale = Math.min(1, MAX_OUTPUT_WIDTH / crop.width)
  const outputWidth = Math.max(1, Math.round(crop.width * scale))
  const outputHeight = Math.max(1, Math.round(crop.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Image cropping is not supported in this browser.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputWidth, outputHeight)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error('The cropped image could not be created.')),
      'image/jpeg',
      0.9,
    )
  })
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'menu-item'
  return new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg' })
}

export function MenuImageCropField({
  id,
  value,
  onChange,
  existingImageUrl,
  existingOriginalImageUrl,
  disabled = false,
}: MenuImageCropFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const shouldInitializeZoomRef = useRef(false)
  const sourceIsNewUploadRef = useRef(false)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [applying, setApplying] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      setSourceFile(null)
      setSourceUrl(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    const url = URL.createObjectURL(value)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    }
  }, [sourceUrl])

  const openCropper = (file: File, isNewUpload: boolean) => {
    shouldInitializeZoomRef.current = true
    sourceIsNewUploadRef.current = isNewUpload
    setSourceFile(file)
    setSourceUrl(URL.createObjectURL(file))
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedArea(null)
    setError(null)
    setDialogOpen(true)
  }

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    openCropper(file, true)
  }

  const handleEditExisting = async () => {
    if (!existingImageUrl) return
    setLoadingExisting(true)
    setError(null)
    try {
      const response = await fetch(existingOriginalImageUrl ?? existingImageUrl)
      if (!response.ok)
        throw new Error('The existing image could not be loaded.')
      const blob = await response.blob()
      const type = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
      const extension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
      openCropper(
        new File([blob], `menu-item.${extension}`, {
          type,
        }),
        false,
      )
    } catch (loadError: any) {
      setError(loadError.message ?? 'The existing image could not be loaded.')
    } finally {
      setLoadingExisting(false)
    }
  }

  const handleCropComplete = useCallback(
    (_croppedAreaPercent: Area, croppedAreaPixels: Area) => {
      setCroppedArea(croppedAreaPixels)
    },
    [],
  )

  const handleMediaLoaded = useCallback((media: MediaSize) => {
    if (!shouldInitializeZoomRef.current) return

    const imageAspect = media.naturalWidth / media.naturalHeight
    const zoomToFit =
      imageAspect > MENU_IMAGE_ASPECT
        ? MENU_IMAGE_ASPECT / imageAspect
        : imageAspect / MENU_IMAGE_ASPECT

    setZoom(Math.max(MIN_ZOOM, Math.min(1, zoomToFit)))
    shouldInitializeZoomRef.current = false
  }, [])

  const handleApply = async () => {
    if (!sourceFile || !sourceUrl || !croppedArea) return
    setApplying(true)
    setError(null)
    try {
      onChange(
        await createCroppedFile(sourceUrl, croppedArea, sourceFile.name),
        sourceIsNewUploadRef.current ? sourceFile : null,
      )
      setDialogOpen(false)
    } catch (cropError: any) {
      setError(cropError.message ?? 'The image could not be cropped.')
    } finally {
      setApplying(false)
    }
  }

  const visiblePreviewUrl = previewUrl ?? existingImageUrl ?? null

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Image</Label>
      {visiblePreviewUrl && (
        <div className="aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          <img
            src={visiblePreviewUrl}
            alt="Menu item preview"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <Input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        disabled={disabled || loadingExisting}
        onChange={handleFileSelection}
      />
      <div className="flex flex-wrap items-center gap-2">
        {!value && existingImageUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || loadingExisting}
            onClick={handleEditExisting}
          >
            {loadingExisting ? 'Loading…' : 'Edit existing photo'}
          </Button>
        )}
        {value && sourceFile && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || loadingExisting}
            onClick={() => setDialogOpen(true)}
          >
            Adjust crop
          </Button>
        )}
        <p className="text-[11px] text-slate-500">
          Drag and zoom to choose the 4:3 area shown on menu cards.
        </p>
      </div>
      {error && !dialogOpen && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!applying) setDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crop menu image</DialogTitle>
            <DialogDescription>
              Drag the image to reposition it and use the slider to zoom.
            </DialogDescription>
          </DialogHeader>

          <div className="relative h-[52vh] min-h-72 max-h-[520px] overflow-hidden rounded-lg bg-slate-950">
            {sourceUrl && (
              <Cropper
                image={sourceUrl}
                crop={crop}
                zoom={zoom}
                aspect={MENU_IMAGE_ASPECT}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                objectFit="contain"
                restrictPosition={zoom >= 1}
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
                onMediaLoaded={handleMediaLoaded}
              />
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${id}-zoom`}>Zoom</Label>
            <input
              id={`${id}-zoom`}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-slate-900"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={applying}
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={applying || !croppedArea}
              onClick={handleApply}
            >
              {applying ? 'Applying…' : 'Use crop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
