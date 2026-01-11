import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/privacy')({
  component: PrivacyRoute,
})

function PrivacyRoute() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">
            Privacy Policy
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/checkout">Back to checkout</Link>
          </Button>
        </div>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6 text-sm text-slate-700">
        <p>
          This Privacy Policy describes how The Grass Patch uses phone numbers
          provided during checkout to deliver order updates via SMS.
        </p>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Information we collect
          </h2>
          <p>
            If you opt in to SMS updates, we collect your phone number and
            associate it with your order. We use this information only to send
            order status messages and related operational updates.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            How we use your phone number
          </h2>
          <p>
            We use your phone number to send recurring SMS messages about order
            confirmation, status, and readiness. Message frequency varies by
            order. Msg & data rates may apply.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Opting out</h2>
          <p>
            You can opt out at any time by replying STOP. For help, reply HELP.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Contact us
          </h2>
          <p>
            If you have questions about this policy, contact The Grass Patch at
            naviuy576@gmail.com.
          </p>
        </div>
      </section>
    </main>
  )
}
