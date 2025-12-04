import { Button } from '@/components/ui/button'
import { setAuthToken } from '@/lib/apiClient'
import { Link, useRouter } from '@tanstack/react-router'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Menu } from 'lucide-react'

type AdminLayoutProps = {
  user: { email: string; role?: string } | null
  children: React.ReactNode
}

export function AdminLayout({ user, children }: AdminLayoutProps) {
  const router = useRouter()
  const isWorker = user?.role === 'WORKER'

  const handleLogout = () => {
    setAuthToken(null)
    router.navigate({ to: '/admin/login' })
  }

  return (
    <section className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500">Signed in as</span>
              <span className="text-sm font-medium text-slate-900">
                {user?.email}
              </span>
            </div>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open admin menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>The Grass Patch</SheetHeader>
              <nav className="mt-6 flex flex-col gap-2">
                <Button variant="ghost" className="justify-start" asChild>
                  <Link to="/">Storefront</Link>
                </Button>
                {!isWorker && (
                  <>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() => router.navigate({ to: '/admin' })}
                    >
                      Dashboard
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() => router.navigate({ to: '/admin/menu' })}
                    >
                      Menu
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => router.navigate({ to: '/admin/queue' })}
                >
                  Queue
                </Button>
                <div className="h-px w-10/12 bg-slate-200 my-3 mx-auto" />
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => router.navigate({ to: '/admin/profile' })}
                >
                  Profile
                </Button>
                {!isWorker && (
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => router.navigate({ to: '/admin/invites' })}
                  >
                    Invites
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => {
                    setAuthToken(null)
                    router.navigate({ to: '/admin/login' })
                  }}
                >
                  Switch account
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start text-red-500"
                  onClick={handleLogout}
                >
                  Log out
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="max-auto px-6 py-8 spacy-y-8">{children}</main>
    </section>
  )
}
