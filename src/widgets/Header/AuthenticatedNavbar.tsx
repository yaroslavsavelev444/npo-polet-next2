import Link from 'next/link'
import { Flex, Button } from '@once-ui-system/core'

type Props = {
  user: {
    id: number
    name: string
    email: string
  }
}

export function AuthenticatedNavbar({ user }: Props) {
  return (
    <>
      <Link href="/">
        <strong>ПОЛЁТ</strong>
      </Link>

      <Flex gap="12" vertical="center">
        <Link href="/profile">
          <Button variant="secondary">
            {user.name}
          </Button>
        </Link>
      </Flex>
    </>
  )
}