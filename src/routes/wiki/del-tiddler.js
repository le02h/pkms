/**
 * DELETE /bags/:bag/tiddlers/:title
 */
module.exports = function (router) {
  router.delete('/bags/:bag/tiddlers/:title', function (req, res) {
    const $tw = req.$tw
    const title = $tw.utils.decodeURIComponentSafe(req.params.title)
    $tw.wiki.deleteTiddler(title)
    res.set('Content-Type', 'text/plain')
    res.status(204).send('OK')
  })
}
