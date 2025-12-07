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
      <div className="relative w-full aspect-[4/3] bg-slate-200">
        {imageUrl ? (
          <div className="absolute inset-0 overflow-hidden">
            {imagePlaceholderUrl && (
              <img
                src={imagePlaceholderUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover object-bottom blur-md scale-105 opacity-80"
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
                'h-full w-full object-cover object-bottom transition duration-500 relative',
                loaded ? 'blur-0 opacity-100' : 'blur-sm opacity-80',
              )}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
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

        {badges.length > 0 && (
          <div className="absolute right-3 top-3 flex flex-wrap gap-2 justify-end">
            {badges.map((badge, idx) => (
              <span
                key={`${badge.label}-${idx}`}
                className="text-[11px] font-semibold px-2 py-1 rounded-full bg-white/25 backdrop-blur-sm text-slate-800 shadow-sm"
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-2">
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
