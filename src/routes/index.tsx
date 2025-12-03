import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useActiveSession } from '@/hooks/useActiveSession'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const { loading, error, open } = useActiveSession()
  const isChecking = loading && !error
  return (
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
            <Button variant="outline" size="lg" className="mt-4 cursor-pointer">
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

      <p className="mt-2 mb-4 text-sm text-gray-500">
        <Link to="/admin/login">Admin Dashboard</Link>
      </p>
    </section>
  )
}
