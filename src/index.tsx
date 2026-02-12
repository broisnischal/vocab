import { Hono } from 'hono'
import { renderer } from './renderer'
import Index from './pages/index'
import { vocabRoutes } from './api/routes/vocab'
import { searchRoutes } from './api/routes/search'
import { graphRoutes } from './api/routes/graph'

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

// API routes
app.route('/api/vocab', vocabRoutes)
app.route('/api/search', searchRoutes)
app.route('/api/graph', graphRoutes)

export default app
