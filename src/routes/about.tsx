import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/about')({
  component: AboutRoute,
})

function AboutRoute() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">
            About & Contact
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6 text-sm text-slate-700">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            About The Grass Patch
          </h2>
          <p>
            The Grass Patch is an event-based food ordering and pickup service
            operated by Ivan Yu. When ordering is open, customers can browse the
            current menu, place an order, and follow its progress through this
            website.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Ordering and pickup
          </h2>
          <p>
            Availability and pickup information are shown for each active
            ordering event. The Grass Patch does not maintain regular storefront
            hours; when ordering is closed, the website will show that the event
            is not currently active.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            SMS order updates
          </h2>
          <p>
            Customers may optionally provide a mobile number during checkout to
            receive transactional order and pickup-readiness updates. The SMS
            program does not send promotional or marketing messages. See our{' '}
            <Link to="/terms" className="underline">
              SMS Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>{' '}
            for details.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Business information
          </h2>
          <dl className="space-y-2">
            <div>
              <dt className="font-medium text-slate-900">Business name</dt>
              <dd>The Grass Patch</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900">Operator</dt>
              <dd>Ivan Yu</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900">Website</dt>
              <dd>thegrasspatch.cafe</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900">Email</dt>
              <dd>
                <a href="mailto:hello@thegrasspatch.cafe" className="underline">
                  hello@thegrasspatch.cafe
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  )
}
