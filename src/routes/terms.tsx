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
            SMS Terms and Conditions
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/checkout">Back to checkout</Link>
          </Button>
        </div>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6 text-sm text-slate-700">
        <p>
          These Terms and Conditions apply to The Grass Patch Order Updates SMS
          program.
        </p>

        <p className="text-xs text-slate-500">Effective August 8, 2026.</p>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Program description
          </h2>
          <p>
            The Grass Patch Order Updates program sends transactional text
            messages about orders placed through thegrasspatch.cafe. Messages
            may include order-status and pickup-readiness notifications. This
            program does not send promotional or marketing messages.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Consent to receive SMS
          </h2>
          <p>
            By providing a mobile number and checking the SMS consent box during
            checkout, you agree to receive transactional text messages from The
            Grass Patch about your order. You confirm that you are the
            subscriber or customary user of the provided number. SMS consent is
            optional and is not a condition of purchase.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Message frequency and charges
          </h2>
          <p>
            Message frequency varies, typically one message per order. Message
            and data rates may apply according to your mobile carrier and plan.
            The Grass Patch does not charge a separate fee for these SMS
            updates.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Opting out and getting help
          </h2>
          <p>
            Reply STOP to opt out at any time. After opting out, no further SMS
            order updates will be sent unless you opt in again. Reply UNSTOP to
            resume messages. Reply HELP for help, or contact
            hello@thegrasspatch.cafe.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Service availability
          </h2>
          <p>
            SMS delivery is subject to wireless-network availability and is not
            guaranteed. Mobile carriers are not liable for delayed or
            undelivered messages. The Grass Patch may change, suspend, or
            discontinue the SMS program at any time.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Privacy</h2>
          <p>
            Our collection and use of mobile information is described in our{' '}
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Contact us</h2>
          <p>
            Questions about these terms? Contact The Grass Patch at
            hello@thegrasspatch.cafe.
          </p>
        </div>
      </section>
    </main>
  )
}
