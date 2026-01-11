import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/terms')({
  component: TermsRoute,
})

function TermsRoute() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">
            Terms of Service
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/checkout">Back to checkout</Link>
          </Button>
        </div>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6 text-sm text-slate-700">
        <p>
          These Terms of Service apply to SMS updates provided by The Grass
          Patch.
        </p>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Consent to receive SMS
          </h2>
          <p>
            By opting in, you consent to receive recurring SMS messages about
            your order. Message frequency varies by order. Msg & data rates may
            apply.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            How to stop or get help
          </h2>
          <p>
            Reply STOP to cancel, or HELP for customer support. Consent is not a
            condition of purchase.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Service availability
          </h2>
          <p>
            We may change or discontinue SMS updates at any time. Carriers are
            not liable for delayed or undelivered messages.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Contact us
          </h2>
          <p>
            Questions about these terms? Contact The Grass Patch at
            naviuy576@gmail.com.
          </p>
        </div>
      </section>
    </main>
  )
}
