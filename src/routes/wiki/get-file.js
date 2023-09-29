const fs = require('fs')
const path = require('path')

/**
 * GET /files/:filepath
 */
module.exports = function (router) {
  router.get('/files/:file', function (req, res) {
    const $tw = req.$tw
    const suppliedFilename = $tw.utils.decodeURIComponentSafe(req.params.file)
    const filesPath = path.resolve($tw.boot.wikiPath, 'files')
    const fullPath = path.resolve(filesPath, suppliedFilename)
    const extension = path.extname(fullPath)

    // Check the fullPath is inside the wiki files folder.
    if (fs.relative(filesPath, fullPath).indexOf('..') !== 0 && fs.existsSync(fullPath)) {
      const info = $tw.config.fileExtensionInfo[extension]
      const contentType = info ? info.type : 'application/octet-stream'

      // Send the file
      res.set('Content-Type', contentType)
      res.sendFile(fullPath, function (err) {
        if (err) console.log(`Error accessing file ${fullPath}: ${err}`)
      })
    } else {
      res.sendStatus(404)
    }
  })
}
