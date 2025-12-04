import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ProductCardProps = {
  title: string
  priceCents?: number | null
  imageUrl?: string | null
  imagePlaceholderUrl?: string | null
  badges?: Array<{ label: string; color: string }>
  isActive?: boolean
  // optional small text under the title if you want it later
  subtitle?: string
  children?: React.ReactNode // actions row at the bottom
  className?: string
}

export function ProductCard({
  title,
  priceCents,
  imageUrl,
  imagePlaceholderUrl,
  badges = [],
  isActive,
  subtitle,
  children,
  className,
}: ProductCardProps) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            observer.disconnect()
          }
        })
      },
      { rootMargin: '200px' },
    )
    observer.observe(img)
    return () => observer.disconnect()
  }, [])

  const statusLabel = isActive ? 'Active' : 'Hidden'
  const statusClasses = isActive
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-slate-200 text-slate-700'

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-0 flex flex-col',
        className,
      )}
    >
      {/* Image area */}
      <div className="relative">
        {imageUrl ? (
          <div className="h-60 w-full overflow-hidden relative bg-slate-200">
            {imagePlaceholderUrl && (
              <img
                src={imagePlaceholderUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover blur-md scale-105 opacity-80"
              />
            )}
            <img
              ref={imgRef}
              src={isInView ? imageUrl : undefined}
              data-src={imageUrl}
              alt={title}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              className={cn(
                'h-60 w-full object-cover transition duration-500 relative',
                loaded ? 'blur-0 opacity-100' : 'blur-sm opacity-80',
              )}
            />
          </div>
        ) : (
          <div className="h-60 w-full bg-slate-200 flex items-center justify-center text-xs text-slate-600">
            No image
          </div>
        )}

        {/* Status pill like “Clothing” in your example */}
        {typeof isActive === 'boolean' && (
          <span
            className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-medium ${statusClasses}`}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {badges.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {badges.map((badge, idx) => (
            <span
              key={`${badge.label}-${idx}`}
              className="text-[11px] font-semibold px-2 py-1 rounded-full"
              style={{ backgroundColor: badge.color || '#e2e8f0', color: '#0f172a' }}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-4 space-y-2">
        <div>
          <h4 className="text-base font-semibold text-slate-900 truncate">
            {title}
          </h4>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500 line-clamp-2">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          {priceCents != null && (
            <span className="text-lg font-semibold text-slate-900">
              ${(priceCents / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Actions row */}
      {children && (
        <div className="border-t border-slate-100 px-4 py-3 flex gap-2">
          {children}
        </div>
      )}
    </Card>
  )
}
