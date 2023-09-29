const fs = require('fs')
const path = require('path')
const express = require('express')
const { TiddlyWiki } = require('tiddlywiki/boot/boot.js')

function Settings (argv) {
  this._defaults = {
    'root-tiddler': '$:/core/save/all',
    'root-render-type': 'text/plain',
    'root-serve-type': 'text/html',
    'system-tiddler-render-type': 'text/plain',
    'system-tiddler-render-template': '$:/core/templates/wikified-tiddler',
    'tiddler-render-type': 'text/html',
    'tiddler-render-template': '$:/core/templates/server/static.tiddler.html'
  }
  this._argv = argv
};

Settings.prototype.get = function (key) {
  return this._argv[key] || this._defaults[key]
}

function createWikiRoutes (app, wikiPath, routePrefix) {
  const settings = new Settings(app.get('args'))
  const router = express.Router()
  router.use((req, res, next) => {
    req.settings = settings
    Object.defineProperty(req, '$tw', {
      get: () => {
        let $tw = req.app.get('$tw')
        if (!$tw || $tw.boot.wikiPath !== wikiPath) {
          $tw = TiddlyWiki()
          $tw.boot.argv = [wikiPath]
          $tw.boot.boot()
          req.app.set('$tw', $tw)
        }
        return $tw
      },
      configurable: false,
      enumerable: false
    })
    next()
  })

  fs.readdir(path.join(__dirname, 'wiki'), function (err, files) {
    if (err) {
      console.error(err)
      return
    }
    files.forEach(function (file) {
      // filename without extension
      const filename = path.basename(file, path.extname(file))
      require(`./wiki/${filename}`)(router)
    })
  })

  app.use(routePrefix, router)
  console.log(`Create wiki routes on ${routePrefix} for ${wikiPath.replace(process.env.HOME, '~')}`)
}

function saveFileAsync (filePath, data) {
  const tmpFilePath = filePath + '.tmp'
  if (fs.existsSync(tmpFilePath)) {
    return Promise.reject(new Error(`Error: ${tmpFilePath} exists`))
  }
  fs.renameSync(filePath, tmpFilePath)
  return new Promise(function (resolve, reject) {
    fs.writeFile(filePath, data, function (err) {
      if (err) {
        console.error(`Error: ${err}`)
        fs.renameSync(tmpFilePath, filePath)
        reject(err)
      } else {
        fs.unlinkSync(tmpFilePath)
        resolve()
      }
    })
  })
}

function backupFile (req, filePath) {
}

function createIndexRoute (app, indexPath, routePrefix) {
  const info = JSON.parse(fs.readFileSync(path.join(indexPath, 'index.info')))
  routePrefix = routePrefix || '/'
  app.get(routePrefix, (req, res) => {
    const links = []
    for (const key in info.items) {
      links.push({
        link: path.join(routePrefix, key),
        text: info.items[key]
      })
    }
    res.render('index', {
      title: info.title,
      links
    })
  })

  if (info.type === 'static') {
    app.put(path.join(routePrefix, ':file'), function (req, res) {
      const filePath = path.join(req.app.get('root-path'), req.path)
      const p = saveFileAsync(filePath, req.body)
      backupFile(req, filePath)
      p.then(() => {
        res.sendStatus(200)
      }).catch(err => {
        res.status(500).send(`Error: ${err}`)
      })
    })

    app.use(routePrefix, express.static(indexPath, {
      maxAge: 60,
      setHeaders: function (res, path) {
        const etagFn = res.app.get('etag fn')
        const etag = etagFn(fs.readFileSync(path))
        res.setHeader('ETag', etag)
      }
    }))
  }
  console.log(`Create index routes on ${routePrefix} for ${indexPath.replace(process.env.HOME, '~')}`)
}

/**
 * Traverse the filesystem tree to create routes.
 *
 * @param {*} app
 * @param {*} root
 * @param {*} current
 */
function traverse (app, root, current) {
  const items = fs.readdirSync(current)
  items.forEach(item => {
    const fullPath = path.join(current, item)
    const stat = fs.lstatSync(fullPath)
    if (stat.isDirectory()) {
      traverse(app, root, fullPath)
    } else if (stat.isFile()) {
      if (item === 'tiddlywiki.info') {
        createWikiRoutes(app, current, current.replace(root, ''))
      } else if (item === 'index.info') {
        createIndexRoute(app, current, current.replace(root, ''))
      }
    }
  })
}

function handleOptionsMethod (req, res) {
  const rootPath = req.app.get('root-path')
  const filePath = path.join(rootPath, req.path)
  if (fs.existsSync(filePath)) {
    if (fs.lstatSync(filePath).isFile()) {
      res.set('DAV', '1')
      res.sendStatus(200)
      return true
    }
  }
}

module.exports = function (app) {
  const rootPath = app.get('root-path')
  app.use(function (req, res, next) {
    if (req.method === 'OPTIONS') {
      if (handleOptionsMethod(req, res)) return
    }
    next()
  })
  traverse(app, rootPath, rootPath)
}
