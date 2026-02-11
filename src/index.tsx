import { Hono } from 'hono'
import { renderer } from './renderer'
import Index from './pages/index'

const app = new Hono()
 
app.use(renderer)

app.get('/', (c) => {
  return c.render(<Index />)
})


app.get('/test', (c) => {
  return c.json({
    message: "working"
  })
})

export default app
