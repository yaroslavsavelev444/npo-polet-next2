// app/(frontend)/layout.tsx

import '@once-ui-system/core/css/styles.css'
import '@once-ui-system/core/css/tokens.css'
import './theme.css'
import './globals.css'

import { Flex, Column, Meta } from '@once-ui-system/core'
import { Manrope, IBM_Plex_Mono } from 'next/font/google'
import {Providers} from '@/providers/Providers'
import { home, baseURL } from '@/resources/content'
import { StickyHeader } from '@/widgets/Header/StickyHeader'
import Footer from '@/widgets/Footer/Footer'
import { cn } from '@/utils/cn'
import { FeedbackButton } from '@/modules/feedback/components/FeedbackButton'
const manrope = Manrope({
  weight: ['200', '300', '400', '500', '600', '700'],
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
})

const mono = IBM_Plex_Mono({
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono',
})

export async function generateMetadata() {
  return Meta.generate({
    title: home.title,
    description: home.description,
    baseURL: baseURL,
    path: home.path,
    image: home.image,
  })
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {

  return (
    <Providers>
      <Flex
        as="html"
        lang="ru"
        fillWidth
        className={cn(manrope.variable, mono.variable)}
        style={{ height: '100%' }}
      >
        <Column
          as="body"
          background="page"
          fillWidth
          style={{ minHeight: '100vh' }}
          margin="0"
          padding="0"
          horizontal="center"
        >
          <StickyHeader />

          <Flex zIndex={0} fillWidth padding="l" horizontal="center" flex={1}>
            <Flex horizontal="center" fillWidth minHeight="0">
              {children}
              <FeedbackButton />

            </Flex>
          </Flex>

          <Footer />
        </Column>
      </Flex>

    </Providers>
  )
}