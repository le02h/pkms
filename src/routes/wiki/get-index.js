/**
 * GET /
 */
module.exports = function (router) {
  router.get('/', function (req, res) {
    const $tw = req.$tw
    const rootTiddler = req.settings.get('root-tiddler')
    const rootServeType = req.settings.get('root-serve-type')
    const rootRenderType = req.settings.get('root-render-type')
    const text = $tw.wiki.renderTiddler(rootRenderType, rootTiddler)
    res.set('Content-Type', rootServeType)
    // res.set('Cache-Control', 'public, max-age=600');
    res.send(text)
  })
}
