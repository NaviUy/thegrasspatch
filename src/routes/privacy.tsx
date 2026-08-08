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

        <p className="text-xs text-slate-500">Effective August 8, 2026.</p>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Information we collect
          </h2>
          <p>
            If you opt in to SMS updates, we collect your phone number and
            associate it with your order. We also retain a record of when and
            how you provided SMS consent so we can honor your communication
            preferences and document that consent.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            How we use your phone number
          </h2>
          <p>
            We use your phone number only to send transactional messages about
            your order, including order status and pickup-readiness updates.
            Message frequency varies, typically one message per order. Msg &
            data rates may apply. SMS consent is optional and is not a condition
            of purchase.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Mobile information sharing
          </h2>
          <p>
            We will not sell or share your mobile information or SMS consent
            with third parties for promotional or marketing purposes. We may
            share this information with service providers, mobile carriers, and
            messaging vendors only as necessary to deliver and support the text
            messages you requested. Those providers may not use it for their own
            marketing purposes.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Data retention
          </h2>
          <p>
            We retain your phone number, order association, and consent record
            only as long as reasonably necessary to provide order updates,
            document consent, resolve messaging issues, and meet applicable
            legal obligations. When this information is no longer needed, we
            delete or anonymize it where reasonably practical.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Opting out</h2>
          <p>
            You can opt out at any time by replying STOP. After opting out, you
            will receive no further SMS order updates unless you opt in again.
            Reply UNSTOP to resume messages. For help, reply HELP or contact us
            at hello@thegrasspatch.cafe.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Contact us</h2>
          <p>
            If you have questions about this policy, contact The Grass Patch at
            hello@thegrasspatch.cafe.
          </p>
        </div>
      </section>
    </main>
  )
}
