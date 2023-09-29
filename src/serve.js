const fs = require('fs')
const path = require('path')
const express = require('express')
const morgan = require('morgan')

function handler (argv) {
  const app = express()
  app.set('views', path.resolve(__dirname, 'views'))
  app.set('view engine', 'hbs')
  app.set('args', argv)
  app.set('root-path', path.resolve(argv.root))

  const rootPath = app.get('root-path')
  const filePath = path.resolve(rootPath, 'index.info')
  if (!fs.existsSync(filePath)) {
    throw new Error(`Error: ${filePath} is not found.`)
  }

  app.use(morgan('short'))
  app.use(express.text({
    defaultCharset: 'utf-8',
    limit: '10mb',
    type: 'text/*'
  }))
  require('./routes')(app)
  app.use(express.static(path.resolve(__dirname, 'assets'), {
    maxAge: 3600
  }))

  app.listen(argv.port, () => {
    console.log(`Serving on http://localhost:${argv.port}`)
  })
}

module.exports = {
  command: 'serve <root> [options]',
  describe: 'start the server.',
  builder (yargs) {
    return yargs.positional('root', {
      type: 'string',
      demandOption: true,
      describe: 'The root directory of wikis.'
    }).option('port', {
      type: 'number',
      default: 8080,
      describe: 'listen port (default 8080)'
    })
  },
  handler
}
