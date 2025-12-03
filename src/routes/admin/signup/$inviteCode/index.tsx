import { createFileRoute } from '@tanstack/react-router'
import { AdminSignupPage } from '@/components/AdminSignupPage'

export const Route = createFileRoute('/admin/signup/$inviteCode/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { inviteCode } = Route.useParams()
  return <AdminSignupPage initialInviteCode={inviteCode} />
}
