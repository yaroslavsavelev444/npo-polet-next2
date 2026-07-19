export const dynamic = 'force-dynamic'
export const revalidate = 0

import { AuthShell } from '@/modules/auth/components/AuthShell'
import { getCachedSettings } from '@/payload/services/settings.service'
import { getAuthImages } from '@/utils/settings-helpers'
import { LoginFlow } from './LoginFlow'

/**
 * Страница входа. Server Component: подтягивает изображение для правой колонки
 * из настроек админки и оборачивает клиентский поток входа в split-screen.
 */
export default async function LoginPage() {
  const settings = await getCachedSettings()
  const { loginUrl } = getAuthImages(settings)

  return (
    <AuthShell imageUrl={loginUrl} imageAlt="Вход в личный кабинет" variant="login">
      <LoginFlow />
    </AuthShell>
  )
}
