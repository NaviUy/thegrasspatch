import serverless from 'serverless-http'
import app from './api-server' // adjust if you need to export the Express app
export const handler = serverless(app)
