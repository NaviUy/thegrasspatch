import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useActiveSession } from '@/hooks/useActiveSession'
import { motion } from 'framer-motion'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const { loading, error, open } = useActiveSession()
  const isChecking = loading && !error
  const footerRef = useRef<HTMLElement | null>(null)
  const [footerVisible, setFooterVisible] = useState(false)

  useEffect(() => {
    const el = footerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setFooterVisible(true)
          } else {
            setFooterVisible(false)
          }
        })
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <section className="flex items-center justify-start w-screen h-screen flex-col">
        <img
          src="/thegrasspatch.png"
          alt="The Grass Patch"
          className="w-64 h-auto -mb-8"
        />
        <h1 className="logo-text text-3xl md:text-5xl uppercase">
          <Link to="/">The Grass Patch</Link>
        </h1>

        <div className="flex flex-col justify-center items-center h-full gap-2">
          {/* Error message if status check failed */}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {isChecking ? (
            // While we don’t know yet
            <Button
              variant="outline"
              size="lg"
              className="mt-4 cursor-default"
              disabled
            >
              Checking store status…
            </Button>
          ) : open ? (
            // Store is open → can start an order
            <Link to="/menu">
              <Button
                variant="outline"
                size="lg"
                className="mt-4 cursor-pointer"
              >
                Start Ordering
              </Button>
            </Link>
          ) : (
            // Store is closed → no ordering
            <>
              <Button
                variant="outline"
                size="lg"
                className="mt-4 cursor-default"
                disabled
              >
                Store is currently closed
              </Button>
              <p className="text-xs text-gray-500">
                Please check back when the event is live.
              </p>
            </>
          )}
        </div>
      </section>
      <motion.footer
        ref={footerRef}
        initial={{ opacity: 0, y: 16 }}
        animate={footerVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="fixed bottom-0 w-full mt-8 py-4 text-center text-sm text-gray-600 flex gap-2 flex-col items-center md:flex-row md:justify-center md:gap-4"
      >
        <Link to="/admin/login" className="md:border-r-2 md:pr-4">
          Admin Dashboard
        </Link>
        <p className="md:border-r-2 md:pr-4">
          THE GRASS PATCH is operated by Ivan Yu
        </p>
        <p>Email: naviuy576@gmail.com</p>
      </motion.footer>
    </>
  )
}
