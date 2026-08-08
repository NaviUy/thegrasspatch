import { createFileRoute } from '@tanstack/react-router'
import { AdminSignupPage } from '@/components/AdminSignupPage'

export const Route = createFileRoute('/admin/signup/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <AdminSignupPage />
}
