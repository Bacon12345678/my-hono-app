import { Hono } from 'hono'
import { Bindings, Variables } from './configs/env'
import getMyAPP from './routes/getMyAPP'
import faqAI from './routes/genFaqAI'
import { cors } from 'hono/cors'
import tinyPNG from './routes/tinyPNG'
import tinyPNGTest from './routes/tinyPNGTest'
import processImages from './routes/processImages'
import getTenantList from './routes/getTenantList'
import AItranslate from './routes/AITranslate'
import r2Test from './routes/r2Test'
import photoUpload from './routes/photoUpload'

const app = new Hono<{ Bindings: Bindings, Variables: Variables}>()

app.use('*', cors({
  origin: '*', // 直接設成字串 '*'
  // 注意：當 origin 是 '*' 時，千萬不要開 credentials: true！
}))

app.route('/', getMyAPP)

app.route('/', faqAI)

app.route('/', tinyPNG)
app.route('/', tinyPNGTest)
app.route('/', processImages)
app.route('/', photoUpload)
app.route('/', r2Test)

app.route('/', getTenantList)

app.route('/', AItranslate)

export default app
