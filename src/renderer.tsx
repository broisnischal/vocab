import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, ViteClient } from 'vite-ssr-components/hono'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;700&display=swap"
        />
        <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
})
